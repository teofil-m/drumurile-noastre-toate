import { describe, expect, it } from 'vitest';
// Known equivalent/accepted Stryker survivors in roadgen.ts: boundary operators on continuous rng values (< vs <=, > vs >=),
// curb-side/lane coin flips (symmetric), and the placement retry cap (20 tries is never exhausted at the densities used).
import { HAZARD_WEIGHTS, ROAD, TRAFFIC } from './config';
import { HAZARD_IDS, getHazard } from './hazards';
import { generateChunk, type Chunk } from './roadgen';

const range = (from: number, toIncl: number): number[] =>
  Array.from({ length: toIncl - from + 1 }, (_, i) => from + i);
const chunks = (seed: number, from: number, toIncl: number, tS: number): Chunk[] =>
  range(from, toIncl).map((i) => generateChunk(seed, i, tS));
const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;
const isCurb = (id: Chunk['hazards'][number]['hazardId']): boolean => getHazard(id).kind === 'curb';

// Equivalent survivors in roadgen.ts (continuous-float boundaries or unreachable defensive code):
// - roadgen.ts:16, 45, 54 (`rng.next() < x` -> `<=`): next() equalling the threshold exactly (fraction / 0.5) has probability ~0.
// - roadgen.ts:27 (`abs(curvature) > bendThreshold` -> `>=`): curvature is a continuous float; exact equality with the threshold is not reachable.
// - roadgen.ts:37 (MAX_PLACEMENT_TRIES loop bound `<`, `<=`, `true`, `t--`): the 20-try drop branch needs 20 consecutive spacing collisions, unreachable at configured densities; the loop exits on first success.
// - roadgen.ts:39 (`>=` -> `>` on minHazardSpacingM): exact spacing equality between two random floats has probability ~0.
describe('generateChunk', () => {
  it('is deterministic for equal (seed, index, tS)', () => {
    expect(generateChunk(42, 7, 120)).toEqual(generateChunk(42, 7, 120));
  });

  it('differs for a different seed', () => {
    expect(generateChunk(1, 5, 300)).not.toEqual(generateChunk(2, 5, 300));
  });

  it('chunk 0 is a safe start: straight, no hazards, no traffic', () => {
    const c = generateChunk(99, 0, 300);
    expect(c.curvature).toBe(0);
    expect(c.hazards).toEqual([]);
    expect(c.traffic).toEqual([]);
    expect(c.index).toBe(0);
    expect(c.startS).toBe(0);
  });

  it('startS and index follow the chunk index', () => {
    const c = generateChunk(3, 12, 0);
    expect(c.index).toBe(12);
    expect(c.startS).toBe(12 * 50);
  });

  it('keeps hazards inside the margins, spaced, laterally bounded; ids unique', () => {
    const ids = new Set<string>();
    let total = 0;
    for (const c of chunks(11, 1, 300, 300)) {
      expect(Math.abs(c.curvature)).toBeLessThanOrEqual(0.02);
      for (const h of c.hazards) {
        total++;
        expect(h.s).toBeGreaterThanOrEqual(c.startS + 3);
        expect(h.s).toBeLessThanOrEqual(c.startS + 47);
        if (isCurb(h.hazardId)) expect(Math.abs(h.lateral)).toBe(3.5);
        else expect(Math.abs(h.lateral)).toBeLessThanOrEqual(3);
        expect(h.instanceId).toMatch(new RegExp(`^${c.index}-h\\d+$`));
        expect(HAZARD_IDS).toContain(h.hazardId);
        ids.add(h.instanceId);
      }
      c.hazards.forEach((h, i) => expect(h.instanceId).toBe(`${c.index}-h${i}`));
      for (let a = 0; a < c.hazards.length; a++)
        for (let b = a + 1; b < c.hazards.length; b++)
          expect(Math.abs(c.hazards[a]!.s - c.hazards[b]!.s)).toBeGreaterThanOrEqual(6);
      for (const t of c.traffic) ids.add(t.instanceId);
      c.traffic.forEach((t, i) => expect(t.instanceId).toBe(`${c.index}-t${i}`));
    }
    expect(total).toBeGreaterThan(300);
    const expected = chunks(11, 1, 300, 300).reduce((n, c) => n + c.hazards.length + c.traffic.length, 0);
    expect(ids.size).toBe(expected);
  });

  it('uses both curb sides, non-curb lateral on both sides and full width', () => {
    const hs = chunks(5, 1, 600, 300).flatMap((c) => c.hazards);
    const curbs = hs.filter((h) => isCurb(h.hazardId));
    expect(curbs.some((h) => h.lateral === 3.5)).toBe(true);
    expect(curbs.some((h) => h.lateral === -3.5)).toBe(true);
    const others = hs.filter((h) => !isCurb(h.hazardId));
    expect(Math.max(...others.map((h) => h.lateral))).toBeGreaterThan(2.8);
    expect(Math.min(...others.map((h) => h.lateral))).toBeLessThan(-2.8);
  });

  it('curvature spans both signs up to the maximum', () => {
    const cs = chunks(8, 1, 500, 0).map((c) => c.curvature);
    expect(Math.max(...cs)).toBeGreaterThan(0.018);
    expect(Math.min(...cs)).toBeLessThan(-0.018);
  });

  it('hazard counts match the density at the start and at full ramp', () => {
    const hi = mean(chunks(21, 1, 1000, 300).map((c) => c.hazards.length));
    // densities retuned in Task 11: 2.4 per 100 m at full ramp, 1 per 100 m at start.
    expect(Math.abs(hi - 1.2) / 1.2).toBeLessThan(0.1);
    const lo = mean(chunks(21, 1, 1000, 0).map((c) => c.hazards.length));
    expect(Math.abs(lo - 0.5) / 0.5).toBeLessThan(0.15);
  });

  it('traffic count matches the density', () => {
    const m = mean(chunks(33, 1, 1000, 300).map((c) => c.traffic.length));
    expect(Math.abs(m - 0.65) / 0.65).toBeLessThan(0.1);
  });

  it('traffic stays in margins, uses both lanes, speeds within lane ranges', () => {
    const ts = chunks(4, 1, 1000, 300).flatMap((c) => c.traffic.map((t) => ({ c, t })));
    expect(ts.some(({ t }) => t.lane === 1)).toBe(true);
    expect(ts.some(({ t }) => t.lane === -1)).toBe(true);
    for (const { c, t } of ts) {
      expect(t.s).toBeGreaterThanOrEqual(c.startS + 3);
      expect(t.s).toBeLessThanOrEqual(c.startS + 47);
      const [lo, hi] = t.lane === 1 ? TRAFFIC.sameDirKmh : TRAFFIC.oncomingKmh;
      expect(t.speedKmh).toBeGreaterThanOrEqual(lo);
      expect(t.speedKmh).toBeLessThanOrEqual(hi);
    }
    const same = ts.filter(({ t }) => t.lane === 1).map(({ t }) => t.speedKmh);
    const onc = ts.filter(({ t }) => t.lane === -1).map(({ t }) => t.speedKmh);
    expect(Math.max(...same)).toBeGreaterThan(68);
    expect(Math.min(...same)).toBeLessThan(42);
    expect(Math.max(...onc)).toBeGreaterThan(78);
    expect(Math.min(...onc)).toBeLessThan(42);
    expect(Math.abs(mean(same) - 55)).toBeLessThan(2);
    expect(Math.abs(mean(onc) - 60)).toBeLessThan(2);
  });

  it('curbs are more common on bends than on straights', () => {
    const all = chunks(77, 1, 2000, 300);
    const share = (cs: Chunk[]): number => {
      const hs = cs.flatMap((c) => c.hazards);
      return hs.filter((h) => isCurb(h.hazardId)).length / hs.length;
    };
    const bend = share(all.filter((c) => Math.abs(c.curvature) > 0.01));
    const straight = share(all.filter((c) => Math.abs(c.curvature) <= 0.01));
    expect(bend).toBeGreaterThan(straight * 1.5);
  });

  it('hazard mix follows the weights on straights', () => {
    const hs = chunks(61, 1, 3000, 300)
      .filter((c) => Math.abs(c.curvature) <= 0.01)
      .flatMap((c) => c.hazards);
    const total = Object.values(HAZARD_WEIGHTS).reduce((a, b) => a + b, 0);
    for (const id of HAZARD_IDS) {
      const share = hs.filter((h) => h.hazardId === id).length / hs.length;
      expect(share).toBeCloseTo(HAZARD_WEIGHTS[id] / total, 1);
    }
  });

  it('config constants have the specified values', () => {
    expect(ROAD).toEqual({ chunkLengthM: 50, halfWidthM: 3.5, minHazardSpacingM: 6, chunkMarginM: 3, maxCurvature: 0.02, bendThreshold: 0.01, bendCurbMultiplier: 3 });
    expect(TRAFFIC).toEqual({ sameDirKmh: [40, 70], oncomingKmh: [40, 80] });
    expect(HAZARD_WEIGHTS).toEqual({ gropita: 45, gropality: 10, 'groapa-de-gunoi': 3, 'craterul-national': 0.5, 'bordura-protocol': 20, 'bordura-everest': 1, 'capac-dansator': 20, 'gura-iadului': 0.5 });
  });
});
