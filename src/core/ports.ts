/** Implementations must never throw: core does not catch. The localStorage adapter must swallow errors. */
export interface KeyValueStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
}

export function memoryStore(initial: Record<string, string> = {}): KeyValueStore {
  const data = new Map<string, string>(Object.entries(initial));
  return {
    get: (key) => data.get(key) ?? null,
    set: (key, value) => {
      data.set(key, value);
    },
  };
}
