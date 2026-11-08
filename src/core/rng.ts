export interface Rng {
  next(): number;
  range(min: number, max: number): number;
  int(minIncl: number, maxExcl: number): number;
  pick<T>(items: readonly { weight: number; value: T }[]): T;
}

function mulberry32(a: number): () => number {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createRng(seed: number): Rng {
  const next = mulberry32(seed);
  const range = (min: number, max: number): number => min + next() * (max - min);
  return {
    next,
    range,
    int: (minIncl, maxExcl) => Math.floor(range(minIncl, maxExcl)),
    pick<T>(items: readonly { weight: number; value: T }[]): T {
      const total = items.reduce((sum, it) => sum + it.weight, 0);
      if (!(total > 0)) throw new Error('pick: no items with positive weight');
      let r = next() * total;
      let last: T | undefined;
      for (const it of items) {
        if (it.weight <= 0) continue;
        if (r < it.weight) return it.value;
        r -= it.weight;
        last = it.value;
      }
      return last as T; // float fall-through: the last item with positive weight
    },
  };
}

export function hashSeed(...parts: number[]): number {
  let h = 0x811c9dc5;
  for (const p of parts) {
    h = Math.imul(h ^ (p | 0), 0x01000193);
    h ^= h >>> 13;
  }
  return h >>> 0;
}
