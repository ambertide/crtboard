// bb-plugin-pi-state — frontend entry.
//
// A floating "Raspberry Pi" card in the bottom-right corner of every window
// (an app overlay), so it stays visible next to sidebar-footer panels such as
// the camera; BB opens only one footer disclosure at a time. It collapses to
// a status pill; the CPU icon in the sidebar footer toggles it too.
//
// The card reads the server's state once with get_state, then follows the
// "pi-state" realtime channel. The board picture stays after the connection
// drops; CPU, memory and the USB OTG indicator show only while connected.
// Restart and Shut down ask for a second click before the server runs them on
// the Pi.
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { definePluginApp, useRealtime, useRpc } from "@get-bb/plugin-sdk/app";
import type { rpcContract } from "./server";
import {
  PI_STATE_CHANNEL,
  piStateSchema,
  type PiState,
  type PiStats,
  type PiUsb,
  type PowerAction,
} from "./state";
import { BoardPicture } from "./board";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

function usePiState() {
  const rpc = useRpc<typeof rpcContract>();
  const [state, setState] = useState<PiState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    rpc.call("get_state", {}).then(
      (next) => {
        if (!cancelled) setState(next);
      },
      (cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [rpc]);

  useRealtime(PI_STATE_CHANNEL, (payload) => {
    const parsed = piStateSchema.safeParse(payload);
    if (parsed.success) {
      setState(parsed.data);
      setError(null);
    }
  });

  const reconnect = useCallback(() => {
    rpc.call("reconnect", {}).catch(() => undefined);
  }, [rpc]);

  return { state, error, reconnect };
}

/** Re-renders every second for relative times. */
function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

function formatDuration(ms: number) {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ${minutes % 60}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

function formatMemory(kb: number) {
  const gb = kb / 1024 / 1024;
  return gb >= 1 ? `${gb.toFixed(1)} GB` : `${Math.round(kb / 1024)} MB`;
}

function Meter({
  label,
  value,
  percent,
}: {
  label: string;
  value: string;
  percent: number | null;
}) {
  const clamped = percent === null ? 0 : Math.min(100, Math.max(0, percent));
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono tabular-nums">{value}</span>
      </div>
      <div
        className="h-1.5 overflow-hidden rounded-full bg-muted"
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(clamped)}
      >
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-500",
            clamped >= 90 ? "bg-red-500" : clamped >= 70 ? "bg-amber-500" : "bg-emerald-500",
          )}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}

function Stats({ stats }: { stats: PiStats }) {
  const usedKb = stats.memTotalKb - stats.memAvailableKb;
  const memPercent = stats.memTotalKb > 0 ? (usedKb / stats.memTotalKb) * 100 : null;
  return (
    <div className="space-y-2">
      <Meter
        label="CPU"
        value={stats.cpuPercent === null ? "…" : `${stats.cpuPercent.toFixed(0)}%`}
        percent={stats.cpuPercent}
      />
      <Meter
        label="Memory"
        value={`${formatMemory(usedKb)} / ${formatMemory(stats.memTotalKb)}`}
        percent={memPercent}
      />
    </div>
  );
}

/** Whether a browser can reach crt-display over the USB-C serial gadget. */
function usbStatus(usb: PiUsb) {
  if (!usb.gadget) return { ready: false, text: "USB OTG off" };
  if (usb.link !== "configured") {
    return { ready: false, text: `USB OTG on, no computer attached (${usb.link})` };
  }
  if (!usb.listener) return { ready: false, text: "USB OTG attached, crt-display not running" };
  return { ready: true, text: "USB OTG ready for WebSerial" };
}

/**
 * The Material Symbols "usb" glyph, drawn in currentColor. Copyright Google
 * LLC, Apache-2.0; see THIRD_PARTY_NOTICES.md.
 */
function UsbGlyph({ className, label }: { className?: string; label?: string }) {
  return (
    <svg
      viewBox="0 -960 960 960"
      fill="currentColor"
      className={className}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <path d="M423.5-103.5Q400-127 400-160q0-21 11-39t29-29v-92H320q-33 0-56.5-23.5T240-400v-92q-18-9-29-27t-11-41q0-33 23.5-56.5T280-640q33 0 56.5 23.5T360-560q0 23-11 40t-29 28v92h120v-320h-80l120-160 120 160h-80v320h120v-80h-40v-160h160v160h-40v80q0 33-23.5 56.5T640-320H520v92q19 10 29.5 28t10.5 40q0 33-23.5 56.5T480-80q-33 0-56.5-23.5Z" />
    </svg>
  );
}

function UsbIndicator({ usb, withText = false }: { usb: PiUsb; withText?: boolean }) {
  const { ready, text } = usbStatus(usb);
  return (
    <span className="flex min-w-0 items-center gap-1.5" title={text}>
      <UsbGlyph
        label={withText ? undefined : text}
        className={cn("size-3.5 shrink-0", ready ? "text-emerald-500" : "text-muted-foreground opacity-60")}
      />
      {withText ? <span className="truncate text-muted-foreground">{text}</span> : null}
    </span>
  );
}

/** How long a Restart / Shut down click waits for its confirming click. */
const CONFIRM_MS = 5000;

const POWER_LABELS: Record<PowerAction, { button: string; icon: string; done: string }> = {
  reboot: { button: "Restart", icon: "RotateCcw", done: "Restart sent" },
  poweroff: { button: "Shut down", icon: "Power", done: "Shutdown sent" },
};

function PowerControls({ hostname }: { hostname: string }) {
  const rpc = useRpc<typeof rpcContract>();
  const [confirming, setConfirming] = useState<PowerAction | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (confirming === null) return;
    const timer = setTimeout(() => setConfirming(null), CONFIRM_MS);
    return () => clearTimeout(timer);
  }, [confirming]);

  const send = (action: PowerAction) => {
    setBusy(true);
    setError(null);
    rpc
      .call("power", { action })
      .then(
        (result) => {
          if (!result.ok) setError(result.error ?? "The command failed.");
        },
        (cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)),
      )
      .finally(() => {
        setBusy(false);
        setConfirming(null);
      });
  };

  return (
    <div className="space-y-1.5">
      {confirming !== null ? (
        <div className="flex items-center gap-2">
          <span className="min-w-0 flex-1">
            {confirming === "reboot"
              ? `Restart ${hostname}?`
              : `Shut down ${hostname}? It stays off until powered on by hand.`}
          </span>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => setConfirming(null)}>
            Cancel
          </Button>
          <Button size="sm" variant="destructive" disabled={busy} onClick={() => send(confirming)}>
            {busy ? "Sending…" : POWER_LABELS[confirming].button}
          </Button>
        </div>
      ) : (
        <div className="flex gap-2">
          {(["reboot", "poweroff"] as const).map((action) => (
            <Button
              key={action}
              size="sm"
              variant="outline"
              className="flex-1 gap-1.5"
              onClick={() => setConfirming(action)}
            >
              <Icon name={POWER_LABELS[action].icon} className="size-3.5" />
              {POWER_LABELS[action].button}
            </Button>
          ))}
        </div>
      )}
      {error !== null ? (
        <div className="max-h-16 select-text overflow-auto break-words text-red-600 dark:text-red-400">
          {error}
        </div>
      ) : null}
    </div>
  );
}

/** Whether the card is expanded, shared by the card and the footer action. */
const expandedStore = (() => {
  const key = "bb-plugin-pi-state:expanded";
  let expanded = (() => {
    try {
      return localStorage.getItem(key) !== "false";
    } catch {
      return true;
    }
  })();
  const listeners = new Set<() => void>();
  return {
    get: () => expanded,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    toggle() {
      expanded = !expanded;
      try {
        localStorage.setItem(key, String(expanded));
      } catch {
        // Private mode: keep the in-memory value.
      }
      for (const listener of listeners) listener();
    },
  };
})();

function PiCard() {
  const { state, error, reconnect } = usePiState();
  const now = useNow();
  const connection = state?.connection;
  const device = state?.device ?? null;

  const status =
    connection === undefined
      ? { tone: "idle", text: error ?? "Loading…" }
      : connection.kind === "connected"
        ? { tone: "live", text: `Connected · ${formatDuration(now - Date.parse(connection.since))}` }
        : connection.kind === "connecting"
          ? { tone: "pending", text: connection.attempt > 0 ? `Reconnecting (attempt ${connection.attempt + 1})…` : "Connecting…" }
          : { tone: "down", text: "Disconnected" };

  const usb = connection?.kind === "connected" ? (state?.usb ?? null) : null;
  const expanded = useSyncExternalStore(expandedStore.subscribe, expandedStore.get);
  const dot = (
    <span
      aria-hidden
      className={cn(
        "size-2 shrink-0 rounded-full",
        status.tone === "live"
          ? "animate-pulse bg-emerald-500"
          : status.tone === "pending"
            ? "bg-amber-500"
            : status.tone === "down"
              ? "bg-red-500"
              : "bg-muted-foreground",
      )}
    />
  );

  if (!expanded) {
    const cpu = connection?.kind === "connected" ? state?.stats?.cpuPercent : null;
    return (
      <button
        type="button"
        onClick={expandedStore.toggle}
        aria-label={`Raspberry Pi: ${status.text}. Show details`}
        className="fixed bottom-3 right-3 z-40 flex items-center gap-2 rounded-full border bg-background px-3 py-1.5 text-xs shadow-lg hover:bg-muted"
      >
        {dot}
        <span className="max-w-32 truncate font-medium">{device?.hostname || "Pi"}</span>
        {usb ? <UsbIndicator usb={usb} /> : null}
        <span className="text-muted-foreground">
          {cpu != null ? `CPU ${cpu.toFixed(0)}%` : status.tone === "live" ? "Live" : status.text}
        </span>
      </button>
    );
  }

  return (
    <div
      role="region"
      aria-label="Raspberry Pi state"
      className="fixed bottom-3 right-3 z-40 w-72 overflow-hidden rounded-lg border bg-background text-xs shadow-lg"
    >
      <button
        type="button"
        onClick={expandedStore.toggle}
        aria-expanded
        aria-label="Collapse Raspberry Pi card"
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left hover:bg-muted/60"
      >
        {dot}
        <span className="font-medium">Raspberry Pi</span>
        {usb ? <UsbIndicator usb={usb} /> : null}
        <span className="min-w-0 flex-1 truncate text-right text-muted-foreground" role="status">
          {status.text}
        </span>
        <Icon name="ChevronDown" className="size-3.5 shrink-0 text-muted-foreground" />
      </button>

      <div className="space-y-2.5 px-2.5 pb-2.5">
        {device !== null ? (
          <div
            className={cn(
              "flex justify-center rounded-md bg-muted/40 p-2 transition-[filter,opacity] [&>svg]:h-auto [&>svg]:max-h-32 [&>svg]:w-full",
              connection?.kind !== "connected" && "opacity-60 grayscale",
            )}
          >
            <BoardPicture model={device.model} />
          </div>
        ) : (
          <div className="flex aspect-[3/2] flex-col items-center justify-center gap-1.5 rounded-md bg-muted/40 text-muted-foreground">
            <Icon name="Cpu" className="size-5" />
            <span>Waiting for the first connection</span>
          </div>
        )}

        <div className="min-w-0">
          <div className="truncate font-medium" title={device?.model}>
            {device?.model ?? "Unknown device"}
          </div>
          <div className="truncate font-mono text-muted-foreground" title={state?.target}>
            {device ? `${device.hostname} · ` : ""}
            {state?.target ?? ""}
          </div>
        </div>

        {connection?.kind === "connected" ? (
          <>
            {state?.stats ? (
              <Stats stats={state.stats} />
            ) : (
              <div className="text-muted-foreground">Waiting for the first sample…</div>
            )}
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Icon name="Activity" className="size-3.5" />
              <span>Heartbeat {formatDuration(now - Date.parse(connection.lastSeen))} ago</span>
            </div>
            {usb ? <UsbIndicator usb={usb} withText /> : null}
            <PowerControls hostname={device?.hostname || "the Pi"} />
          </>
        ) : null}

        {state?.power && connection?.kind !== "connected" ? (
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Icon name={POWER_LABELS[state.power.action].icon} className="size-3.5" />
            <span>
              {POWER_LABELS[state.power.action].done}{" "}
              {formatDuration(now - Date.parse(state.power.at))} ago
              {state.power.action === "reboot" ? " · waiting for it to come back" : ""}
            </span>
          </div>
        ) : null}

        {connection?.kind === "disconnected" ? (
          <div className="space-y-2">
            <div className="max-h-20 select-text overflow-auto break-words text-red-600 dark:text-red-400">
              {connection.error}
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">
                Retry {connection.attempt} in{" "}
                {formatDuration(Date.parse(connection.retryAt) - now)}
                {device ? ` · last seen ${new Date(device.lastSeen).toLocaleString()}` : ""}
              </span>
              <Button size="sm" variant="secondary" onClick={reconnect}>
                Retry now
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default definePluginApp((app) => {
  app.slots.experimental_appOverlay({ id: "pi-state-card", component: PiCard });
  app.experimental_sidebarFooter.register({
    kind: "action",
    id: "pi-state",
    label: "Raspberry Pi",
    icon: "Cpu",
    onActivate: expandedStore.toggle,
  });
});
