/** A flashing item alternates these colours, one second each, bright first. */
export type FlashPhase = "bright" | "dim";

/** How long a changed value flashes before settling on its normal colour. */
export const FLASH_MS = 6000;

export const FLASH_COLORS: Record<FlashPhase, string> = {
  bright: "var(--gray-50)",
  dim: "var(--gray-400)",
};

/**
 * Phase of a flash that began at `since`, or null once it has settled. Both
 * times come from the once-a-second clock, so whole seconds are rounded.
 */
export function flashPhase(since: number | undefined, now: number, duration = FLASH_MS): FlashPhase | null {
  if (since === undefined) return null;
  const seconds = Math.round((now - since) / 1000);
  if (seconds < 0 || seconds >= duration / 1000) return null;
  return seconds % 2 === 0 ? "bright" : "dim";
}

/** Phase of an item that flashes until further notice, such as an upcoming event. */
export function continuousFlashPhase(now: number): FlashPhase {
  return Math.round(now / 1000) % 2 === 0 ? "bright" : "dim";
}
