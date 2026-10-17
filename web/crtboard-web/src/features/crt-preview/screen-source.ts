import testCardUrl from "./PM5540.png";
import { rasterize } from "./rasterize";

/** The PAL frame size the Raspberry Pi outputs. */
export const SCREEN_WIDTH = 720;
export const SCREEN_HEIGHT = 576;

export type ScreenMode =
  | { kind: "pre-connection" }
  | { kind: "test-card" }
  | { kind: "image"; image: HTMLImageElement }
  | { kind: "dashboard"; element: HTMLElement };

function loadImage(src: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.src = src;
  return image.decode().then(() => image);
}

/**
 * The canvas holding the CRT picture. The shader preview and the Raspberry
 * Pi stream both read from it.
 */
export class ScreenSource {
  readonly canvas = document.createElement("canvas");
  #ctx: CanvasRenderingContext2D;
  #mode: ScreenMode = { kind: "pre-connection" };
  #testCard = loadImage(testCardUrl);
  #observer = new MutationObserver(() => this.#redraw());
  #drawing = false;
  #dirty = false;

  constructor() {
    this.canvas.width = SCREEN_WIDTH;
    this.canvas.height = SCREEN_HEIGHT;
    const ctx = this.canvas.getContext("2d");
    if (!ctx) throw new Error("2D canvas is not available");
    this.#ctx = ctx;
    this.#redraw();
  }

  setMode(mode: ScreenMode): void {
    this.#observer.disconnect();
    this.#mode = mode;
    if (mode.kind === "dashboard") {
      this.#observer.observe(mode.element, { subtree: true, childList: true, characterData: true, attributes: true });
    }
    this.#redraw();
  }

  /** Coalesces redraws: changes made while a frame is being drawn trigger one more. */
  async #redraw(): Promise<void> {
    if (this.#drawing) {
      this.#dirty = true;
      return;
    }
    this.#drawing = true;
    try {
      do {
        this.#dirty = false;
        await this.#draw(this.#mode);
      } while (this.#dirty);
    } catch (error) {
      console.warn("could not draw the CRT screen", error);
    } finally {
      this.#drawing = false;
    }
  }

  async #draw(mode: ScreenMode): Promise<void> {
    const ctx = this.#ctx;
    switch (mode.kind) {
      case "dashboard":
        return rasterize(mode.element, ctx);
      case "test-card":
        ctx.drawImage(await this.#testCard, 0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
        return;
      case "pre-connection": {
        const testCard = await this.#testCard;
        ctx.fillStyle = "#101828";
        ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
        ctx.globalAlpha = 0.4;
        this.#drawFitted(testCard, "cover");
        ctx.globalAlpha = 1;
        return;
      }
      case "image":
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
        this.#drawFitted(mode.image, "contain");
    }
  }

  #drawFitted(image: HTMLImageElement, fit: "cover" | "contain"): void {
    const pick = fit === "cover" ? Math.max : Math.min;
    const scale = pick(SCREEN_WIDTH / image.naturalWidth, SCREEN_HEIGHT / image.naturalHeight);
    const width = image.naturalWidth * scale;
    const height = image.naturalHeight * scale;
    this.#ctx.drawImage(image, (SCREEN_WIDTH - width) / 2, (SCREEN_HEIGHT - height) / 2, width, height);
  }
}
