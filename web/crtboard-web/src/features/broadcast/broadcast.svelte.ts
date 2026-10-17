import { PiLink } from "./pi-link";

/** PAL shows 25 frames a second. */
const FRAME_INTERVAL_MS = 1000 / 25;

export type BroadcastStatus = "unsupported" | "idle" | "connecting" | "live";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function encode(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => {
      if (!blob) return reject(new Error("could not encode the CRT frame"));
      blob.arrayBuffer().then((buffer) => resolve(new Uint8Array(buffer)), reject);
    }, "image/png"),
  );
}

/**
 * Streams the screen canvas to the Raspberry Pi over WebSerial. Each frame
 * waits for the Pi's acknowledgement, so a slow link drops frames instead of
 * queueing them.
 */
class Broadcast {
  status = $state<BroadcastStatus>(PiLink.supported ? "idle" : "unsupported");
  #link: PiLink | null = null;

  async start(canvas: HTMLCanvasElement): Promise<void> {
    if (this.status !== "idle") return;
    this.status = "connecting";
    try {
      const link = await PiLink.open();
      this.#link = link;
      link.onclose = () => {
        if (this.#link === link) this.#link = null;
        this.status = "idle";
      };
      this.status = "live";
      this.#stream(link, canvas);
    } catch (error) {
      // Closing the picker without choosing a port lands here too.
      console.warn("could not connect to the Raspberry Pi", error);
      this.status = "idle";
    }
  }

  async #stream(link: PiLink, canvas: HTMLCanvasElement): Promise<void> {
    while (this.#link === link) {
      const started = performance.now();
      try {
        await link.sendFrame(await encode(canvas));
      } catch (error) {
        console.warn("lost the Raspberry Pi", error);
        await link.close();
        return;
      }
      await sleep(FRAME_INTERVAL_MS - (performance.now() - started));
    }
  }
}

export const broadcast = new Broadcast();
