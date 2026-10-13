// Shared between server.ts and app.tsx: the state the server publishes on the
// "pi-state" realtime channel and returns from the get_state RPC. The app
// parses realtime payloads with this schema since they are untrusted input.
import { z } from "zod";

export const PI_STATE_CHANNEL = "pi-state";

export const deviceSchema = z.object({
  /** /proc/device-tree/model, e.g. "Raspberry Pi 4 Model B Rev 1.4". */
  model: z.string().max(200),
  hostname: z.string().max(200),
  firstSeen: z.string(),
  lastSeen: z.string(),
});

export const statsSchema = z.object({
  /** Busy share of all cores since the previous sample, 0–100. */
  cpuPercent: z.number().min(0).max(100).nullable(),
  memTotalKb: z.number().nonnegative(),
  memAvailableKb: z.number().nonnegative(),
  at: z.string(),
});

export const connectionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("connecting"), attempt: z.number().int() }),
  z.object({
    kind: z.literal("connected"),
    since: z.string(),
    /** Last line received from the device; it reports every 2 s. */
    lastSeen: z.string(),
  }),
  z.object({
    kind: z.literal("disconnected"),
    error: z.string().max(2000),
    attempt: z.number().int(),
    retryAt: z.string(),
  }),
]);

export const powerActionSchema = z.enum(["reboot", "poweroff"]);

export const piStateSchema = z.object({
  /** user@host[:port] the plugin connects to. */
  target: z.string(),
  connection: connectionSchema,
  /** The last device seen at this target; kept after the connection drops. */
  device: deviceSchema.nullable(),
  /** Latest sample; null unless connected. */
  stats: statsSchema.nullable(),
  /** A restart or shutdown sent from the panel; cleared on the next connect. */
  power: z.object({ action: powerActionSchema, at: z.string() }).nullable(),
});

export type PiDevice = z.infer<typeof deviceSchema>;
export type PiStats = z.infer<typeof statsSchema>;
export type PiConnection = z.infer<typeof connectionSchema>;
export type PiState = z.infer<typeof piStateSchema>;
export type PowerAction = z.infer<typeof powerActionSchema>;
