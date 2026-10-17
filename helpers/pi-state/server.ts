// bb-plugin-pi-state — backend entry.
//
// A background service keeps one `ssh` session open to the Raspberry Pi. The
// remote side runs a small sh loop that prints the board model once, then a
// CPU, memory and USB OTG sample every 2 s:
//
//   model Raspberry Pi 4 Model B Rev 1.4
//   host crtpi
//   stat cpu  1234 0 567 89012 ...      (every 2 s)
//   mem 3884396 3120044                  (every 2 s)
//   usb fe980000.usb configured active   (every 2 s)
//
// The usb line is the device controller bound to a USB gadget ("-" if none),
// its state ("configured" once a computer has enumerated it), and whether the
// crt-display service that serves the serial port is active.
//
// The connection counts as alive while those lines keep arriving. When ssh
// exits, or no line arrives for STALE_MS, the service reconnects with
// exponential backoff. The last device seen at each target is kept in
// bb.storage so the panel can show its picture while disconnected.
//
// The panel's Restart and Shut down buttons run `sudo -n systemctl reboot` or
// `poweroff` over a separate ssh exec; this needs passwordless sudo on the Pi.
//
// Every state change is published on the "pi-state" realtime channel; a newly
// opened panel reads the current state with the get_state RPC.
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { defineRpcContract, type BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";
import {
  PI_STATE_CHANNEL,
  piStateSchema,
  powerActionSchema,
  type PiDevice,
  type PiState,
  type PowerAction,
} from "./state";

const BACKOFF_BASE_MS = 1000;
const BACKOFF_MAX_MS = 60_000;
/** Without a line for this long, the session is considered dead. */
const STALE_MS = 15_000;
/** Covers ssh's ConnectTimeout plus authentication. */
const FIRST_LINE_TIMEOUT_MS = 25_000;
const MAX_STDERR_CHARS = 4000;
const POWER_TIMEOUT_MS = 20_000;

const REMOTE_SCRIPT = `
model=$(tr -d '\\000' < /proc/device-tree/model 2>/dev/null)
[ -n "$model" ] || model=$(sed -n 's/^Model[[:space:]]*: //p' /proc/cpuinfo | head -n 1)
echo "model $model"
echo "host $(hostname)"
while :; do
  echo "stat $(head -n 1 /proc/stat)"
  echo "mem $(awk '/^MemTotal:/{t=$2} /^MemAvailable:/{a=$2} END{print t, a}' /proc/meminfo)"
  udc=$(cat /sys/kernel/config/usb_gadget/*/UDC 2>/dev/null | grep -m 1 .)
  link=$([ -n "$udc" ] && cat "/sys/class/udc/$udc/state" 2>/dev/null)
  echo "usb \${udc:--} $(echo \${link:--} | tr ' ' '-') $(systemctl is-active crt-display 2>/dev/null)"
  sleep 2
done
`;

// Validated so a setting can never be read by ssh as an option.
const hostSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9][A-Za-z0-9.:-]*$/, "Enter a hostname or IP address");
const usernameSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z_][A-Za-z0-9_.-]*$/, "Enter a Unix username");

type Target = { host: string; username: string; port: number };

function targetLabel({ host, username, port }: Target) {
  return `${username}@${host}${port === 22 ? "" : `:${port}`}`;
}

function sshArgs(target: Target, command: string) {
  return [
    "-T",
    "-o", "BatchMode=yes",
    "-o", "ConnectTimeout=10",
    "-o", "ServerAliveInterval=5",
    "-o", "ServerAliveCountMax=3",
    "-o", "StrictHostKeyChecking=accept-new",
    "-o", "LogLevel=ERROR",
    "-p", String(target.port),
    "-l", target.username,
    "--", target.host,
    command,
  ];
}

function lastLine(text: string) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .at(-1);
}

function deviceKey(target: Target) {
  return `device:${targetLabel(target)}`;
}

function backoffDelay(attempt: number) {
  const delay = Math.min(BACKOFF_BASE_MS * 2 ** attempt, BACKOFF_MAX_MS);
  // ±20% jitter so a fleet of clients would not retry in lockstep.
  return Math.round(delay * (0.8 + Math.random() * 0.4));
}

type CpuSample = { busy: number; total: number };

/** Parse the aggregate "cpu ..." line of /proc/stat. */
function parseCpuLine(line: string): CpuSample | null {
  const fields = line.trim().split(/\s+/);
  if (fields[0] !== "cpu") return null;
  const values = fields.slice(1, 9).map(Number);
  if (values.length < 4 || values.some((value) => !Number.isFinite(value))) {
    return null;
  }
  const total = values.reduce((sum, value) => sum + value, 0);
  // idle + iowait
  const idle = values[3]! + (values[4] ?? 0);
  return { busy: total - idle, total };
}

export const rpcContract = defineRpcContract({
  get_state: {
    input: z.object({}),
    output: piStateSchema,
  },
  reconnect: {
    input: z.object({}),
    output: z.object({ ok: z.boolean() }),
  },
  power: {
    input: z.object({ action: powerActionSchema }),
    output: z.object({ ok: z.boolean(), error: z.string().optional() }),
  },
});

export default async function plugin(bb: BbPluginApi) {
  const settings = bb.settings.define({
    host: {
      type: "string",
      label: "Host",
      description: "IP address or hostname of the Raspberry Pi.",
      default: "192.168.68.79",
      experimental_schema: hostSchema,
    },
    username: {
      type: "string",
      label: "Username",
      default: "crt",
      experimental_schema: usernameSchema,
    },
    port: {
      type: "number",
      label: "SSH port",
      default: 22,
      experimental_schema: z.number().int().min(1).max(65535),
    },
  });

  async function readTarget(): Promise<Target> {
    const values = await settings.get();
    return {
      host: hostSchema.parse(values.host),
      username: usernameSchema.parse(values.username),
      port: values.port,
    };
  }

  let state: PiState = {
    target: "",
    connection: { kind: "connecting", attempt: 0 },
    device: null,
    stats: null,
    usb: null,
    power: null,
  };

  function update(next: Partial<PiState>) {
    state = { ...state, ...next };
    bb.realtime.publish(PI_STATE_CHANNEL, state);
  }

  /** Wakes the service from its backoff wait. */
  let wake: (() => void) | null = null;
  /** Aborts the current session (target changed). */
  let session: AbortController | null = null;

  settings.onChange(() => {
    session?.abort();
    wake?.();
  });

  function waitForRetry(ms: number, signal: AbortSignal) {
    return new Promise<void>((resolve) => {
      const done = () => {
        clearTimeout(timer);
        signal.removeEventListener("abort", done);
        wake = null;
        resolve();
      };
      const timer = setTimeout(done, ms);
      signal.addEventListener("abort", done, { once: true });
      wake = done;
    });
  }

  async function rememberDevice(target: Target, model: string, hostname: string) {
    const now = new Date().toISOString();
    const previous = await bb.storage.kv.get<PiDevice>(deviceKey(target));
    const device: PiDevice = {
      model: model.slice(0, 200),
      hostname: hostname.slice(0, 200),
      firstSeen: previous?.firstSeen ?? now,
      lastSeen: now,
    };
    await bb.storage.kv.set(deviceKey(target), device);
    return device;
  }

  /**
   * Runs one ssh session until it ends. Resolves with whether the device
   * ever answered (which resets the backoff) and why the session ended.
   */
  function runSession(
    target: Target,
    signal: AbortSignal,
  ): Promise<{ connected: boolean; error: string }> {
    return new Promise((resolve) => {
      const child = spawn("ssh", sshArgs(target, REMOTE_SCRIPT), {
        stdio: ["ignore", "pipe", "pipe"],
      });

      let connected = false;
      let stalled = false;
      let finished = false;
      let stderr = "";
      let model = "";
      let previousCpu: CpuSample | null = null;
      let cpuPercent: number | null = null;

      let watchdog = setTimeout(onStall, FIRST_LINE_TIMEOUT_MS);
      function onStall() {
        stalled = true;
        child.kill("SIGKILL");
      }
      function onAbort() {
        child.kill("SIGTERM");
      }
      signal.addEventListener("abort", onAbort, { once: true });

      const finish = (error: string) => {
        if (finished) return;
        finished = true;
        clearTimeout(watchdog);
        signal.removeEventListener("abort", onAbort);
        resolve({ connected, error });
      };

      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (chunk: string) => {
        stderr = (stderr + chunk).slice(-MAX_STDERR_CHARS);
      });

      const lines = createInterface({ input: child.stdout });
      lines.on("line", (line) => {
        clearTimeout(watchdog);
        watchdog = setTimeout(onStall, STALE_MS);
        const space = line.indexOf(" ");
        const kind = space === -1 ? line : line.slice(0, space);
        const rest = space === -1 ? "" : line.slice(space + 1);
        const now = new Date().toISOString();
        switch (kind) {
          case "model":
            model = rest.trim() || "Unknown device";
            break;
          case "host": {
            connected = true;
            bb.log.info(`connected to ${targetLabel(target)} (${model})`);
            update({
              connection: { kind: "connected", since: now, lastSeen: now },
              power: null,
            });
            rememberDevice(target, model, rest.trim()).then(
              (device) => {
                if (!finished) update({ device });
              },
              (error: unknown) =>
                bb.log.warn(`could not store device: ${String(error)}`),
            );
            break;
          }
          case "stat": {
            const sample = parseCpuLine(rest);
            if (sample === null) break;
            if (previousCpu !== null && sample.total > previousCpu.total) {
              const busy = sample.busy - previousCpu.busy;
              const total = sample.total - previousCpu.total;
              cpuPercent = Math.min(100, Math.max(0, (busy / total) * 100));
            }
            previousCpu = sample;
            break;
          }
          case "usb": {
            const [udc, link, listener] = rest.trim().split(/\s+/);
            if (!connected || udc === undefined || link === undefined) break;
            update({
              usb: {
                gadget: udc !== "-",
                link: link === "-" ? "unbound" : link.slice(0, 40),
                listener: listener === "active",
              },
            });
            break;
          }
          case "mem": {
            const [memTotalKb, memAvailableKb] = rest.trim().split(/\s+/).map(Number);
            if (!connected || !Number.isFinite(memTotalKb) || !Number.isFinite(memAvailableKb)) {
              break;
            }
            const since =
              state.connection.kind === "connected" ? state.connection.since : now;
            update({
              connection: { kind: "connected", since, lastSeen: now },
              stats: {
                cpuPercent,
                memTotalKb: memTotalKb!,
                memAvailableKb: memAvailableKb!,
                at: now,
              },
            });
            break;
          }
        }
      });

      child.on("error", (error) => {
        finish(`Could not run ssh: ${error.message}`);
      });
      child.on("close", (code, closeSignal) => {
        const reason = lastLine(stderr);
        finish(
          stalled
            ? connected
              ? `No data from the device for ${STALE_MS / 1000} s.`
              : "Timed out connecting."
            : (reason ??
                (closeSignal
                  ? `ssh stopped (${closeSignal}).`
                  : `ssh exited with code ${code}.`)),
        );
      });
    });
  }

  bb.background.service("ssh-session", {
    async start(signal) {
      let attempt = 0;
      while (!signal.aborted) {
        let target: Target;
        try {
          target = await readTarget();
        } catch (error) {
          update({
            target: "",
            device: null,
            stats: null,
            usb: null,
            connection: {
              kind: "disconnected",
              error: `Invalid settings: ${error instanceof Error ? error.message : String(error)}`,
              attempt,
              retryAt: new Date(Date.now() + BACKOFF_MAX_MS).toISOString(),
            },
          });
          await waitForRetry(BACKOFF_MAX_MS, signal);
          continue;
        }

        const label = targetLabel(target);
        const device =
          (await bb.storage.kv.get<PiDevice>(deviceKey(target))) ?? null;
        update({
          target: label,
          device,
          stats: null,
          usb: null,
          connection: { kind: "connecting", attempt },
        });

        session = new AbortController();
        const result = await runSession(
          target,
          AbortSignal.any([signal, session.signal]),
        );
        const targetChanged = session.signal.aborted;
        session = null;
        if (signal.aborted) break;
        if (result.connected || targetChanged) attempt = 0;
        if (targetChanged) continue;

        const delay = backoffDelay(attempt);
        attempt += 1;
        bb.log.info(
          `${label} disconnected (${result.error}); retry ${attempt} in ${delay} ms`,
        );
        update({
          stats: null,
          usb: null,
          connection: {
            kind: "disconnected",
            error: result.error.slice(0, 2000),
            attempt,
            retryAt: new Date(Date.now() + delay).toISOString(),
          },
        });
        await waitForRetry(delay, signal);
      }
    },
  });

  /** Runs `sudo -n systemctl <action>` on the Pi; resolves with an error or null. */
  function runPowerCommand(target: Target, action: PowerAction) {
    return new Promise<string | null>((resolve) => {
      const child = spawn("ssh", sshArgs(target, `sudo -n systemctl ${action}`), {
        stdio: ["ignore", "ignore", "pipe"],
      });
      let stderr = "";
      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (chunk: string) => {
        stderr = (stderr + chunk).slice(-MAX_STDERR_CHARS);
      });
      const timer = setTimeout(() => child.kill("SIGKILL"), POWER_TIMEOUT_MS);
      child.on("error", (error) => {
        clearTimeout(timer);
        resolve(`Could not run ssh: ${error.message}`);
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        // The Pi may drop the connection before ssh reads the exit status.
        if (code === 0 || /closed by remote host|connection reset/i.test(stderr)) {
          resolve(null);
        } else {
          resolve(lastLine(stderr) ?? `ssh exited with code ${code}.`);
        }
      });
    });
  }

  bb.rpc.register(rpcContract, {
    get_state: () => state,
    reconnect: () => {
      if (wake === null) return { ok: false };
      wake();
      return { ok: true };
    },
    power: async ({ action }) => {
      if (state.connection.kind !== "connected") {
        return { ok: false, error: "The Pi is not connected." };
      }
      const target = await readTarget();
      bb.log.info(`sending ${action} to ${targetLabel(target)}`);
      const error = await runPowerCommand(target, action);
      if (error !== null) {
        bb.log.warn(`${action} failed: ${error}`);
        return { ok: false, error: error.slice(0, 500) };
      }
      update({ power: { action, at: new Date().toISOString() } });
      return { ok: true };
    },
  });
}
