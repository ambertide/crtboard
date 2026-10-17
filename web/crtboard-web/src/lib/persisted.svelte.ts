/** Reactive state that is kept in localStorage under `key`. */
export function persisted<T>(key: string, initial: T): { value: T } {
  const state = $state({ value: read(key, initial) });
  $effect.root(() => {
    $effect(() => {
      localStorage.setItem(key, JSON.stringify(state.value));
    });
  });
  return state;
}

function read<T>(key: string, initial: T): T {
  const raw = localStorage.getItem(key);
  if (raw === null) return initial;
  try {
    const stored = JSON.parse(raw);
    // Merging keeps fields added since the value was last saved.
    const isRecord = (v: unknown) => typeof v === "object" && v !== null && !Array.isArray(v);
    return isRecord(initial) && isRecord(stored) ? { ...initial, ...stored } : stored;
  } catch {
    return initial;
  }
}
