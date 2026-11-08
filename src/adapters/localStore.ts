import type { KeyValueStore } from '../core/ports';

function defaultStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function createLocalStore(storage: Storage | null = defaultStorage()): KeyValueStore {
  const fallback = new Map<string, string>();
  return {
    get(key) {
      try {
        if (storage && !fallback.has(key)) return storage.getItem(key);
      } catch {
        // fall through to memory
      }
      return fallback.get(key) ?? null;
    },
    set(key, value) {
      try {
        if (storage) {
          storage.setItem(key, value);
          fallback.delete(key);
          return;
        }
      } catch {
        // fall through to memory
      }
      fallback.set(key, value);
    },
  };
}
