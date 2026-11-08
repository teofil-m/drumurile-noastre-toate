import { describe, expect, it } from 'vitest';
import { hazardDensityPer100m, rampProgress, trafficDensityPer100m } from './difficulty';

// RAMP retuned 2026-11-08 after final review (base 0.85, extra 2.79, exponent 6.46, fullAtS 274.6) so the greedy-bot distribution guard holds.
// Floor: the road stays interesting (>= 0.8 hazards per 100 m) once the early game is over (relaxed from 1 after the retune).
// Equivalent survivor: difficulty.ts:4 `tS < 0` -> `<= 0`; at tS = 0 the fallthrough yields min(0 / fullAtS, 1) = 0, same as the early return.
describe('difficulty ramp', () => {
  it.each([[0, 0], [137.3, 0.5], [274.6, 1], [600, 1], [-10, 0], [NaN, 0], [Infinity, 0], [-Infinity, 0], [68.65, 0.25]])('rampProgress at %p s', (t, p) => {
    expect(rampProgress(t)).toBeCloseTo(p, 9);
  });
  it.each([[0, 0.85], [274.6, 3.64], [600, 3.64], [137.3, 0.85 + 2.79 * 0.5 ** 6.46], [-10, 0.85], [NaN, 0.85]])('hazard density at %p s', (t, d) => {
    expect(hazardDensityPer100m(t)).toBeCloseTo(d, 6);
  });
  it.each([[0, 0.1], [137.3, 0.7], [274.6, 1.3], [900, 1.3], [-5, 0.1], [NaN, 0.1]])('traffic density at %p s', (t, d) => {
    expect(trafficDensityPer100m(t)).toBeCloseTo(d, 6);
  });
  it('keeps at least 0.8 hazards per 100 m after 60 s', () => {
    for (let t = 60; t <= 600; t += 10) expect(hazardDensityPer100m(t)).toBeGreaterThanOrEqual(0.8);
  });
  it('is non-decreasing over time', () => {
    let prev = -1;
    for (let t = 0; t <= 400; t += 5) {
      const d = hazardDensityPer100m(t);
      expect(d).toBeGreaterThanOrEqual(prev);
      prev = d;
    }
  });
});
