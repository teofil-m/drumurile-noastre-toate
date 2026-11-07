import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ROAD } from './config';

// Scripted Rng so the placement-retry loop (roadgen.ts:37-41) can be driven into its edge cases.
const script = vi.hoisted(() => ({ ranges: [] as number[], fallback: 0, rangeCalls: 0 }));

vi.mock('./rng', () => ({
  hashSeed: () => 1,
  createRng: () => ({
    next: () => 0,
    range: (min: number) => { script.rangeCalls++; return script.ranges.length > 0 ? script.ranges.shift()! : script.fallback || min; },
    int: () => 0,
    pick: <T>(items: readonly { value: T }[]) => items.find((it) => (it.value as unknown as string) === 'gropita')!.value,
  }),
}));

import { generateChunk } from './roadgen';

const X = ROAD.chunkLengthM + 20; // inside chunk 1 margins
const FREE = X + 2 * ROAD.minHazardSpacingM;
const FULL_RAMP_TS = 1000; // 2 hazards per chunk with the scripted next() === 0
const placed = (): number[] => generateChunk(1, 1, FULL_RAMP_TS).hazards.map((h) => h.s);

describe('generateChunk placement retries (stubbed rng)', () => {
  beforeEach(() => { script.ranges = []; script.rangeCalls = 0; script.fallback = X; });

  it('places two hazards when the second finds a free slot', () => {
    script.ranges = [0, X, 0, FREE, 0];
    expect(placed()).toEqual([X, FREE]);
  });
  it('drops a hazard after 20 colliding tries and stops trying', () => {
    script.ranges = [0, X, 0, ...Array<number>(20).fill(X)];
    expect(placed()).toEqual([X]);
    // curvature + first candidate + first lateral + exactly 20 retries, then traffic draws (fallback only).
    const retriesAndSetup = 3 + 20;
    expect(script.rangeCalls).toBeGreaterThanOrEqual(retriesAndSetup);
    // a 21st free candidate must never be consulted
    script.ranges = [0, X, 0, ...Array<number>(20).fill(X), FREE];
    expect(placed()).toEqual([X]);
  });
  it('accepts a free slot on the 20th (last allowed) try', () => {
    script.ranges = [0, X, 0, ...Array<number>(19).fill(X), FREE, 0];
    expect(placed()).toEqual([X, FREE]);
  });
  it('treats a candidate exactly minHazardSpacingM away as free (roadgen.ts:39 `>=`)', () => {
    script.ranges = [0, X, 0, X + ROAD.minHazardSpacingM, 0];
    expect(placed()).toEqual([X, X + ROAD.minHazardSpacingM]);
  });
});
