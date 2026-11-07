import { describe, expect, it } from 'vitest';
// Known equivalent mutant: `tS < 0` -> `tS <= 0` (t=0 yields 0 either way).
import { hazardDensityPer100m, rampProgress, trafficDensityPer100m } from './difficulty';

describe('difficulty ramp', () => {
  it.each([[0, 0], [150, 0.5], [300, 1], [600, 1], [-10, 0], [NaN, 0], [Infinity, 0], [-Infinity, 0], [75, 0.25]])('rampProgress at %p s', (t, p) => {
    expect(rampProgress(t)).toBeCloseTo(p, 9);
  });
  it.each([[0, 0.6], [300, 7.0], [600, 7.0], [150, 0.6 + 6.4 * 0.5 ** 1.5], [-10, 0.6], [NaN, 0.6]])('hazard density at %p s', (t, d) => {
    expect(hazardDensityPer100m(t)).toBeCloseTo(d, 6);
  });
  it.each([[0, 0.1], [150, 0.7], [300, 1.3], [900, 1.3], [-5, 0.1], [NaN, 0.1]])('traffic density at %p s', (t, d) => {
    expect(trafficDensityPer100m(t)).toBeCloseTo(d, 6);
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
