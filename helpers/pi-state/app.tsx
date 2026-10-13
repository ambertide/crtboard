// bb-plugin-pi-state — frontend entry.
//
// A "Raspberry Pi" panel at the bottom of the left sidebar (a sidebar-footer
// disclosure). It reads the server's state once with get_state, then follows
// the "pi-state" realtime channel. The board picture stays after the
// connection drops; CPU and memory show only while connected.
import { useCallback, useEffect, useState } from "react";
import { definePluginApp, useRealtime, useRpc } from "@get-bb/plugin-sdk/app";
import type { rpcContract } from "./server";
import { PI_STATE_CHANNEL, piStateSchema, type PiState, type PiStats } from "./state";
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

function PiPanel() {
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

  return (
    <div role="region" aria-label="Raspberry Pi state" className="text-xs">
      <div className="flex items-center gap-2 px-2.5 py-1.5">
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
        <span className="font-medium">Raspberry Pi</span>
        <span className="min-w-0 flex-1 truncate text-right text-muted-foreground" role="status">
          {status.text}
        </span>
      </div>

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
          </>
        ) : connection?.kind === "disconnected" ? (
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
  app.experimental_sidebarFooter.register({
    kind: "disclosure",
    id: "pi-state",
    label: "Raspberry Pi",
    icon: "Cpu",
    component: PiPanel,
  });
});
