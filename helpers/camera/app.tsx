// bb-plugin-camera — frontend entry.
//
// A panel at the bottom of the left sidebar (a sidebar-footer disclosure)
// keeps the camera feed on in every BB window. The feed
// comes from the camera helper (proxied by the server's http/frame route)
// when it is running; otherwise the window opens its own camera, which works
// in a web browser but not in the macOS desktop app. With its own camera the
// window also answers the server's "capture-request" signal.
//
// A headless app overlay stays mounted even when the panel is closed. It
// opens the panel at startup, records every "capture-taken" in a small
// shared store, and reopens the panel so the capture indicator is seen.
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  definePluginApp,
  experimental_usePluginId,
  useRealtime,
  useRpc,
  type ExperimentalSidebarFooterDisclosureController,
} from "@get-bb/plugin-sdk/app";
import type { CaptureRequest, CaptureTaken, rpcContract } from "./server";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

// Must match the channel names in server.ts (type-only import above keeps the
// server out of the app bundle).
const CAPTURE_REQUEST = "capture-request";
const CAPTURE_TAKEN = "capture-taken";

/** Longest edge of the frame sent to the agent. */
const MAX_CAPTURE_EDGE = 1280;
const INDICATOR_MS = 4000;
/** How long a granted stream may go without a frame before we call it stuck. */
const STALL_MS = 5000;
/** How often to look for the camera helper while it is not running. */
const HELPER_RETRY_MS = 3000;

type StreamState =
  | { kind: "starting" }
  | { kind: "live" }
  | { kind: "error"; message: string };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseCaptureRequest(value: unknown): CaptureRequest | null {
  if (!isObject(value)) return null;
  const { requestId, threadId } = value;
  if (typeof requestId !== "string" || typeof threadId !== "string") {
    return null;
  }
  return { requestId, threadId };
}

function parseCaptureTaken(value: unknown): CaptureTaken | null {
  if (!isObject(value)) return null;
  const { requestId, threadId, at } = value;
  if (
    typeof requestId !== "string" ||
    typeof threadId !== "string" ||
    typeof at !== "string"
  ) {
    return null;
  }
  return { requestId, threadId, at };
}

function describeMediaError(cause: unknown): string {
  if (cause instanceof DOMException) {
    if (cause.name === "NotAllowedError") return "Camera access was denied.";
    if (cause.name === "NotFoundError") return "No camera found.";
    if (cause.name === "NotReadableError") return "The camera is in use.";
  }
  return cause instanceof Error ? cause.message : String(cause);
}

/**
 * Owns the camera stream for the overlay's lifetime and attaches it to
 * whichever <video> element is mounted (a callback ref, so a remounted
 * element is re-attached). "live" means frames are actually flowing, not
 * just that permission was granted.
 */
function useCameraStream(enabled: boolean) {
  const [state, setState] = useState<StreamState>({ kind: "starting" });
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [video, setVideo] = useState<HTMLVideoElement | null>(null);
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    let media: MediaStream | null = null;
    setState({ kind: "starting" });
    setStream(null);
    if (!enabled) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      setState({ kind: "error", message: "Camera API unavailable here." });
      return;
    }
    navigator.mediaDevices
      .getUserMedia({ video: { width: { ideal: 1280 } }, audio: false })
      .then((granted) => {
        if (cancelled) {
          granted.getTracks().forEach((track) => track.stop());
          return;
        }
        media = granted;
        // Restart when the device goes away (unplugged, taken by another app).
        for (const track of granted.getVideoTracks()) {
          track.addEventListener("ended", () => {
            if (!cancelled) setAttempt((n) => n + 1);
          });
        }
        setStream(granted);
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setState({ kind: "error", message: describeMediaError(cause) });
        }
      });
    return () => {
      cancelled = true;
      media?.getTracks().forEach((track) => track.stop());
    };
  }, [attempt, enabled]);

  useEffect(() => {
    if (video === null || stream === null) return;
    video.muted = true;
    video.srcObject = stream;
    const markLive = () => {
      if (video.videoWidth > 0) setState({ kind: "live" });
    };
    const play = () => void video.play().catch(() => undefined);
    video.addEventListener("loadedmetadata", play);
    video.addEventListener("playing", markLive);
    video.addEventListener("resize", markLive);
    play();
    markLive();
    // A granted track that never delivers a frame usually means the OS is
    // blocking the app (e.g. a macOS build without the camera entitlement).
    const stall = setTimeout(() => {
      if (video.videoWidth === 0) {
        setState({
          kind: "error",
          message:
            "The camera sends no frames. This BB app may lack macOS camera access; try BB in a web browser.",
        });
      }
    }, STALL_MS);
    // Chromium can pause media in a hidden/occluded window; resume on return.
    const onVisible = () => {
      if (document.visibilityState === "visible" && video.paused) play();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      video.removeEventListener("loadedmetadata", play);
      video.removeEventListener("playing", markLive);
      video.removeEventListener("resize", markLive);
      document.removeEventListener("visibilitychange", onVisible);
      clearTimeout(stall);
      video.srcObject = null;
    };
  }, [video, stream]);

  return { state, stream, video, videoRef: setVideo, retry };
}

type HelperFeed =
  | { kind: "connecting" }
  | { kind: "live"; src: string }
  | { kind: "down"; message: string };

function sleep(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

/** Long-polls the server for the camera helper's frames. */
function useHelperFeed(): HelperFeed {
  const pluginId = experimental_usePluginId();
  const [feed, setFeed] = useState<HelperFeed>({ kind: "connecting" });

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    // Keep the shown URL and the one before it; revoke older ones.
    const urls: string[] = [];
    const endpoint = `/api/v1/plugins/${encodeURIComponent(pluginId)}/http/frame`;
    void (async () => {
      let seq = 0;
      while (!signal.aborted) {
        try {
          const response = await fetch(`${endpoint}?after=${seq}`, {
            signal,
            cache: "no-store",
          });
          if (!response.ok) {
            const body: unknown = await response.json().catch(() => null);
            const message =
              isObject(body) && typeof body.error === "string"
                ? body.error
                : `HTTP ${response.status}`;
            setFeed({ kind: "down", message });
            seq = 0;
            await sleep(HELPER_RETRY_MS, signal);
            continue;
          }
          const nextSeq = Number(response.headers.get("x-frame-seq")) || 0;
          const blob = await response.blob();
          if (nextSeq === seq) {
            // No new frame within the long-poll window; don't spin.
            await sleep(200, signal);
            continue;
          }
          seq = nextSeq;
          const url = URL.createObjectURL(blob);
          urls.push(url);
          while (urls.length > 2) URL.revokeObjectURL(urls.shift()!);
          setFeed({ kind: "live", src: url });
        } catch (cause) {
          if (signal.aborted) break;
          setFeed({
            kind: "down",
            message: cause instanceof Error ? cause.message : String(cause),
          });
          seq = 0;
          await sleep(HELPER_RETRY_MS, signal);
        }
      }
    })();
    return () => {
      controller.abort();
      for (const url of urls) URL.revokeObjectURL(url);
    };
  }, [pluginId]);

  return feed;
}

type Frame = { data: string; width: number; height: number };

function encodeFrame(
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
): Frame {
  const scale = Math.min(
    1,
    MAX_CAPTURE_EDGE / Math.max(sourceWidth, sourceHeight),
  );
  const width = Math.round(sourceWidth * scale);
  const height = Math.round(sourceHeight * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (context === null) throw new Error("Canvas is unavailable.");
  context.drawImage(source, 0, 0, width, height);
  const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
  return { data: dataUrl.slice(dataUrl.indexOf(",") + 1), width, height };
}

type ImageCaptureLike = { grabFrame(): Promise<ImageBitmap> };
type ImageCaptureCtor = new (track: MediaStreamTrack) => ImageCaptureLike;

function describeTrack(stream: MediaStream | null, video: HTMLVideoElement | null) {
  const track = stream?.getVideoTracks()[0];
  return [
    track
      ? `track ${track.readyState}${track.muted ? " (muted)" : ""}${track.enabled ? "" : " (disabled)"}`
      : "no track",
    video
      ? `video readyState ${video.readyState}${video.paused ? ", paused" : ""}`
      : "no video element",
    `page ${document.visibilityState}`,
  ].join(", ");
}

/** Grab a still: from the <video> if it has a frame, else from the track. */
async function captureFrame(
  stream: MediaStream | null,
  video: HTMLVideoElement | null,
): Promise<Frame> {
  if (video !== null && video.videoWidth > 0 && video.videoHeight > 0) {
    return encodeFrame(video, video.videoWidth, video.videoHeight);
  }
  const track = stream?.getVideoTracks()[0];
  const ImageCapture = (window as unknown as { ImageCapture?: ImageCaptureCtor })
    .ImageCapture;
  if (track !== undefined && track.readyState === "live" && ImageCapture) {
    let bitmap: ImageBitmap;
    try {
      bitmap = await new ImageCapture(track).grabFrame();
    } catch (cause) {
      const detail =
        cause instanceof Error || cause instanceof DOMException
          ? `${cause.name}: ${cause.message}`
          : String(cause);
      throw new Error(`grabFrame failed (${detail})`);
    }
    try {
      return encodeFrame(bitmap, bitmap.width, bitmap.height);
    } finally {
      bitmap.close();
    }
  }
  throw new Error(
    `The camera has not produced a frame (${describeTrack(stream, video)}).`,
  );
}


/** Captures announced by the server, shared by the listener and the panel. */
type CaptureEvent = { key: number; at: Date; receivedAt: number };
const captureStore = (() => {
  let last: CaptureEvent | null = null;
  const listeners = new Set<() => void>();
  const seen = new Set<string>();
  return {
    record(taken: CaptureTaken) {
      if (seen.has(taken.requestId)) return false;
      seen.add(taken.requestId);
      if (seen.size > 50) seen.clear();
      last = {
        key: (last?.key ?? 0) + 1,
        at: new Date(taken.at),
        receivedAt: Date.now(),
      };
      for (const listener of listeners) listener();
      return true;
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    get: () => last,
  };
})();

let panelController: ExperimentalSidebarFooterDisclosureController | null =
  null;

/** Always mounted: opens the panel and catches captures while it is closed. */
function CaptureListener() {
  useEffect(() => {
    panelController?.open();
  }, []);
  useRealtime(CAPTURE_TAKEN, (payload) => {
    const taken = parseCaptureTaken(payload);
    if (taken !== null && captureStore.record(taken)) panelController?.open();
  });
  return null;
}

/** True while the most recent capture's indicator should still show. */
function useCaptureIndicator() {
  const last = useSyncExternalStore(captureStore.subscribe, captureStore.get);
  const [, rerender] = useState(0);
  const remaining = last ? INDICATOR_MS - (Date.now() - last.receivedAt) : 0;
  useEffect(() => {
    if (remaining <= 0) return;
    const timer = setTimeout(() => rerender((n) => n + 1), remaining);
    return () => clearTimeout(timer);
  }, [last, remaining > 0]); // eslint-disable-line react-hooks/exhaustive-deps
  return { last, on: remaining > 0, remaining };
}

function CameraPanel() {
  const rpc = useRpc<typeof rpcContract>();
  const helper = useHelperFeed();
  const useHelper = helper.kind !== "down";
  // Open the window's own camera only when the helper is not running.
  const browser = useCameraStream(!useHelper);
  const { stream, video, videoRef, retry } = browser;
  const state: StreamState =
    helper.kind === "live"
      ? { kind: "live" }
      : helper.kind === "connecting"
        ? { kind: "starting" }
        : browser.state.kind === "error"
          ? {
              kind: "error",
              message: `${browser.state.message} ${helper.message}`,
            }
          : browser.state;
  const latest = useRef({ state, stream, video, useHelper });
  latest.current = { state, stream, video, useHelper };
  const indicator = useCaptureIndicator();

  // Answer capture requests from the agent tool (browser-camera mode only).
  useRealtime(CAPTURE_REQUEST, (payload) => {
    const request = parseCaptureRequest(payload);
    if (request === null) return;
    const {
      state: current,
      stream: media,
      video: element,
      useHelper: helperMode,
    } = latest.current;
    const fail = (reason: string) =>
      rpc
        .call("capture_fail", { requestId: request.requestId, reason })
        .catch(() => undefined);
    if (helperMode) {
      void fail("This window shows the helper feed; it has no camera of its own.");
      return;
    }
    if (current.kind === "error") {
      void fail(`${current.message} [${describeTrack(media, element)}]`);
      return;
    }
    // Try even while "starting": the track fallback may still have a frame.
    captureFrame(media, element).then(
      (frame) =>
        rpc
          .call("capture_submit", {
            requestId: request.requestId,
            mimeType: "image/jpeg",
            ...frame,
          })
          .catch(() => undefined),
      (cause: unknown) => {
        const message =
          cause instanceof Error || cause instanceof DOMException
            ? `${cause.name}: ${cause.message}`
            : `rejected with ${String(cause)}`;
        void fail(`${message} [${describeTrack(media, element)}]`);
      },
    );
  });

  return (
    // Flush inside the host's own bordered disclosure frame; the capture
    // indicator draws its red border as an inset ring on top.
    <div role="region" aria-label="Camera feed" className="relative">
      {indicator.on ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-10 rounded-[inherit] ring-2 ring-inset ring-red-500"
        />
      ) : null}
      <style>{`
        @keyframes bb-camera-flash { 0% { opacity: 0.95 } 100% { opacity: 0 } }
        @keyframes bb-camera-pop { 0% { transform: translateY(-4px); opacity: 0 } 10%, 85% { transform: none; opacity: 1 } 100% { opacity: 0 } }
      `}</style>
      <div className="flex items-center gap-2 px-2.5 py-1.5 text-xs">
        <span
          className={cn(
            "size-2 shrink-0 rounded-full",
            state.kind === "live"
              ? "animate-pulse bg-red-500"
              : state.kind === "starting"
                ? "bg-amber-500"
                : "bg-muted-foreground",
          )}
          aria-hidden
        />
        <span className="font-medium">Camera</span>
        <span className="min-w-0 flex-1 truncate text-muted-foreground">
          {state.kind === "live"
            ? indicator.last
              ? `Last picture ${indicator.last.at.toLocaleTimeString()}`
              : "Live"
            : state.kind === "starting"
              ? "Starting…"
              : "Off"}
        </span>
      </div>
      <div className="relative aspect-video bg-black">
        {helper.kind === "live" ? (
          <img
            src={helper.src}
            alt="Camera feed"
            className="absolute inset-0 size-full object-cover"
            style={{ transform: "scaleX(-1)" }}
          />
        ) : null}
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className={cn("size-full object-cover", useHelper && "invisible")}
          // Mirror the preview like a selfie view; captures stay unmirrored.
          style={{ transform: "scaleX(-1)" }}
        />
        {state.kind === "error" ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-3 text-center text-xs text-white/80">
            <Icon name="CameraOff" className="size-5" />
            <span className="max-h-24 select-text overflow-auto break-words">
              {state.message}
            </span>
            <Button size="sm" variant="secondary" onClick={retry}>
              Retry
            </Button>
          </div>
        ) : null}
        {indicator.on && indicator.last ? (
          <>
            <div
              key={`flash-${indicator.last.key}`}
              className="pointer-events-none absolute inset-0 bg-white"
              style={{ animation: "bb-camera-flash 450ms ease-out forwards" }}
            />
            <div
              key={`badge-${indicator.last.key}`}
              role="status"
              aria-live="polite"
              className="pointer-events-none absolute left-2 top-2 flex items-center gap-1.5 rounded-full bg-red-600 px-2 py-0.5 text-[11px] font-medium text-white shadow"
              style={{
                animation: `bb-camera-pop ${INDICATOR_MS}ms ease-out forwards`,
              }}
            >
              <Icon name="Camera" className="size-3" />
              Agent took a picture
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

export default definePluginApp((app) => {
  panelController = app.experimental_sidebarFooter.register({
    kind: "disclosure",
    id: "camera-feed",
    label: "Camera",
    icon: "Camera",
    component: CameraPanel,
  });
  app.slots.experimental_appOverlay({
    id: "camera-capture-listener",
    component: CaptureListener,
  });
});
