/** How long the Philips test card is shown before and after an uploaded image. */
export const TEST_CARD_MS = 3000;

export type UploadPhase = "idle" | "intro" | "showing" | "outro";

/** Shows a user-picked image on the CRT, framed by the test card, until stopped. */
class UploadPlayback {
  phase = $state<UploadPhase>("idle");
  image = $state<HTMLImageElement | null>(null);
  #timer: ReturnType<typeof setTimeout> | undefined;

  async play(file: File): Promise<void> {
    const image = new Image();
    image.src = URL.createObjectURL(file);
    try {
      await image.decode();
    } catch (error) {
      URL.revokeObjectURL(image.src);
      console.warn("could not read the chosen image", error);
      return;
    }
    this.#release();
    this.image = image;
    this.#enter("intro", "showing");
  }

  stop(): void {
    if (this.phase === "idle" || this.phase === "outro") return;
    this.#enter("outro", "idle");
  }

  #enter(phase: UploadPhase, then: UploadPhase): void {
    clearTimeout(this.#timer);
    this.phase = phase;
    this.#timer = setTimeout(() => {
      this.phase = then;
      if (then === "idle") this.#release();
    }, TEST_CARD_MS);
  }

  #release(): void {
    if (this.image) URL.revokeObjectURL(this.image.src);
    this.image = null;
  }
}

export const upload = new UploadPlayback();
