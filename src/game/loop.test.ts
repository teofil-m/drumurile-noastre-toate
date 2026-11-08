import { describe, expect, it } from 'vitest';
import { fixedSteps } from './loop';

describe('fixedSteps', () => {
  it('one step for one 60Hz frame', () => {
    const r = fixedSteps(0, 1 / 60);
    expect(r.steps).toBe(1);
    expect(r.accS).toBeLessThan(1 / 60);
  });
  it('caps at 5 steps and drops excess', () => {
    const r = fixedSteps(0, 0.5);
    expect(r.steps).toBe(5);
    expect(r.accS).toBeLessThan(1 / 60);
  });
  it('honours custom step and max', () => {
    const r = fixedSteps(0, 0.35, 0.1, 2);
    expect(r.steps).toBe(2);
    expect(r.accS).toBeLessThan(0.1);
    const q = fixedSteps(0.05, 0.06, 0.1, 5);
    expect(q.steps).toBe(1);
    expect(q.accS).toBeCloseTo(0.01, 9);
  });
  it('treats NaN, Infinity and negative dt as 0', () => {
    expect(fixedSteps(0, NaN).steps).toBe(0);
    expect(fixedSteps(0, Infinity).steps).toBe(0);
    expect(fixedSteps(0, -1).steps).toBe(0);
    expect(fixedSteps(0.001, -1).accS).toBe(0.001);
  });
  it('accumulates sub-step frames', () => {
    const a = fixedSteps(0, 0.01);
    expect(a.steps).toBe(0);
    expect(a.accS).toBeCloseTo(0.01, 9);
    expect(fixedSteps(a.accS, 0.01).steps).toBe(1);
  });
});
