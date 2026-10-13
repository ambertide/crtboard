// bb-plugin-camera — backend entry.
//
// Two camera sources, tried in this order:
//
// 1. The camera helper (helper/camera_helper.py). macOS gives no frames to
//    the BB desktop app or anything it starts, so the user runs the helper
//    from Terminal. It serves JPEG frames on 127.0.0.1 behind a token it
//    writes to ~/.bb-camera/helper.json. The server proxies those frames to
//    the overlay (GET http/frame) and takes agent pictures from it.
// 2. A BB window's own camera (BB in a web browser). The tool asks every
//    window for a frame over realtime and takes the first RPC answer:
//
//   tool call ──realtime "capture-request"──▶ every open window
//   window    ──rpc capture_submit──────────▶ resolves the pending call
//
// Either way the server then publishes "capture-taken" and every window
// flashes its indicator.
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineRpcContract, type BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";

/** How long a capture may take before the tool reports no camera. */
const CAPTURE_TIMEOUT_MS = 10_000;
/** Base64 JPEG ceiling (~3 MB decoded); the app sends far less. */
const MAX_IMAGE_BASE64 = 4_000_000;

const HELPER_STATE_FILE = join(homedir(), ".bb-camera", "helper.json");
const HELPER_TIMEOUT_MS = 3000;
/** The helper script beside server.ts (path install) or dist/server.js. */
function helperScriptPath(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  for (const candidate of [
    join(here, "helper", "camera_helper.py"),
    join(here, "..", "helper", "camera_helper.py"),
  ]) {
    if (existsSync(candidate)) return candidate;
  }
  return "<plugin dir>/helper/camera_helper.py";
}
const HELPER_START_HINT = `Start the camera helper in Terminal: python3 "${helperScriptPath()}"`;

const helperStateSchema = z.object({
  port: z.number().int().min(1).max(65535),
  token: z.string().min(16).max(200),
});

type HelperFrame = {
  jpeg: ArrayBuffer;
  seq: number;
  width: number;
  height: number;
};

class HelperUnavailableError extends Error {}

async function readHelperState() {
  let raw: string;
  try {
    raw = await readFile(HELPER_STATE_FILE, "utf8");
  } catch {
    throw new HelperUnavailableError(
      `Camera helper is not running. ${HELPER_START_HINT}`,
    );
  }
  const parsed = helperStateSchema.safeParse(JSON.parse(raw));
  if (!parsed.success) {
    throw new HelperUnavailableError(`Unreadable ${HELPER_STATE_FILE}.`);
  }
  return parsed.data;
}

/** Fetch a frame newer than `after` (the helper waits up to 1 s for one). */
async function fetchHelperFrame(
  after: number,
  signal?: AbortSignal,
): Promise<HelperFrame> {
  const { port, token } = await readHelperState();
  const timeout = AbortSignal.timeout(HELPER_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`http://127.0.0.1:${port}/frame?after=${after}`, {
      headers: { "X-Camera-Token": token },
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
  } catch {
    throw new HelperUnavailableError(
      `Camera helper is not responding on port ${port}. ${HELPER_START_HINT}`,
    );
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: unknown;
    } | null;
    const reason =
      typeof body?.error === "string" ? body.error : `HTTP ${response.status}`;
    throw new HelperUnavailableError(`Camera helper has no frame: ${reason}`);
  }
  const header = (name: string) =>
    Number.parseInt(response.headers.get(name) ?? "0", 10) || 0;
  return {
    jpeg: await response.arrayBuffer(),
    seq: header("X-Frame-Seq"),
    width: header("X-Frame-Width"),
    height: header("X-Frame-Height"),
  };
}

export const CAPTURE_REQUEST = "capture-request";
export const CAPTURE_TAKEN = "capture-taken";

export type CaptureRequest = { requestId: string; threadId: string };
export type CaptureTaken = { requestId: string; threadId: string; at: string };

export const rpcContract = defineRpcContract({
  capture_submit: {
    input: z.object({
      requestId: z.string().min(1).max(64),
      mimeType: z.enum(["image/jpeg", "image/png"]),
      data: z.string().min(1).max(MAX_IMAGE_BASE64),
      width: z.number().int().positive(),
      height: z.number().int().positive(),
    }),
    output: z.object({ accepted: z.boolean() }),
  },
  capture_fail: {
    input: z.object({
      requestId: z.string().min(1).max(64),
      reason: z.string().max(500),
    }),
    output: z.object({ accepted: z.boolean() }),
  },
});

type Frame = {
  mimeType: "image/jpeg" | "image/png";
  data: string;
  width: number;
  height: number;
};

type Pending = {
  threadId: string;
  resolve: (frame: Frame) => void;
  reject: (error: Error) => void;
  /** Windows that reported a failure; the call fails only if none succeed. */
  failures: string[];
};

export default async function plugin(bb: BbPluginApi) {
  const pending = new Map<string, Pending>();

  function requestFrame(threadId: string, signal: AbortSignal): Promise<Frame> {
    const requestId = randomUUID();
    return new Promise<Frame>((resolve, reject) => {
      const finish = () => {
        clearTimeout(timer);
        signal.removeEventListener("abort", onAbort);
        pending.delete(requestId);
      };
      const onAbort = () => {
        finish();
        reject(new Error("Capture cancelled."));
      };
      const timer = setTimeout(() => {
        const entry = pending.get(requestId);
        finish();
        reject(
          new Error(
            entry && entry.failures.length > 0
              ? `Camera unavailable: ${entry.failures.join("; ")}`
              : "No BB window with an active camera answered. Ask the user to open BB and allow camera access.",
          ),
        );
      }, CAPTURE_TIMEOUT_MS);
      signal.addEventListener("abort", onAbort, { once: true });
      pending.set(requestId, {
        threadId,
        resolve: (frame) => {
          finish();
          resolve(frame);
        },
        reject: (error) => {
          finish();
          reject(error);
        },
        failures: [],
      });
      const request: CaptureRequest = { requestId, threadId };
      bb.realtime.publish(CAPTURE_REQUEST, request);
    });
  }

  function announce(requestId: string, threadId: string) {
    const taken: CaptureTaken = {
      requestId,
      threadId,
      at: new Date().toISOString(),
    };
    bb.realtime.publish(CAPTURE_TAKEN, taken);
  }

  // The overlay's live feed: the helper's latest frame, long-polled with
  // ?after=<seq>. "local" auth limits this to the BB app's own origin.
  bb.http.route("GET", "/frame", async (c) => {
    const after = Number.parseInt(c.req.query("after") ?? "0", 10) || 0;
    try {
      const frame = await fetchHelperFrame(Math.max(0, after));
      return new Response(frame.jpeg, {
        headers: {
          "content-type": "image/jpeg",
          "cache-control": "no-store",
          "x-frame-seq": String(frame.seq),
        },
      });
    } catch (error) {
      return Response.json(
        { error: error instanceof Error ? error.message : String(error) },
        { status: 503, headers: { "cache-control": "no-store" } },
      );
    }
  });

  bb.rpc.register(rpcContract, {
    capture_submit: ({ requestId, mimeType, data, width, height }) => {
      const entry = pending.get(requestId);
      if (entry === undefined) return { accepted: false };
      entry.resolve({ mimeType, data, width, height });
      announce(requestId, entry.threadId);
      return { accepted: true };
    },
    capture_fail: ({ requestId, reason }) => {
      const entry = pending.get(requestId);
      if (entry === undefined) return { accepted: false };
      // Another window may still succeed, so record and let the timeout
      // decide. Keep the list bounded.
      if (entry.failures.length < 5) entry.failures.push(reason);
      return { accepted: true };
    },
  });

  bb.agents.registerTool({
    name: "camera_take_picture",
    description:
      "Take a still picture from the user's camera (the live feed shown in the BB window) and return it as an image. The user sees an indicator every time a picture is taken.",
    instructions:
      "Use camera_take_picture only when the user asks you to look through their camera or the task needs it. Each call is visible to the user.",
    presentation: {
      label: { pending: "Taking a picture", completed: "Took a picture" },
      icon: { glyph: "Camera" },
    },
    parameters: z.object({}),
    async execute(_params, { threadId, signal }) {
      let helperError: string;
      try {
        const frame = await fetchHelperFrame(0, signal);
        announce(randomUUID(), threadId);
        bb.log.info(
          `helper picture for ${threadId} (${frame.width}x${frame.height})`,
        );
        return {
          content: [
            {
              type: "image",
              data: Buffer.from(frame.jpeg).toString("base64"),
              mimeType: "image/jpeg",
            },
            {
              type: "text",
              text: `Captured ${frame.width}x${frame.height} picture at ${new Date().toISOString()}.`,
            },
          ],
        };
      } catch (error) {
        if (signal.aborted) {
          return {
            content: [{ type: "text", text: "Capture cancelled." }],
            isError: true,
          };
        }
        helperError = error instanceof Error ? error.message : String(error);
      }
      // No helper: ask a BB window with its own camera (BB in a browser).
      try {
        const frame = await requestFrame(threadId, signal);
        bb.log.info(
          `window picture for ${threadId} (${frame.width}x${frame.height})`,
        );
        return {
          content: [
            { type: "image", data: frame.data, mimeType: frame.mimeType },
            {
              type: "text",
              text: `Captured ${frame.width}x${frame.height} picture at ${new Date().toISOString()}.`,
            },
          ],
        };
      } catch (error) {
        const windowError =
          error instanceof Error ? error.message : String(error);
        return {
          content: [
            {
              type: "text",
              text: `${helperError}\nBrowser camera fallback also failed: ${windowError}`,
            },
          ],
          isError: true,
        };
      }
    },
  });

  bb.onDispose(() => {
    for (const entry of pending.values()) {
      entry.reject(new Error("Camera plugin reloaded."));
    }
    pending.clear();
  });
}
