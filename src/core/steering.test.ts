import { describe, it, expect } from 'vitest';
import { createRng } from './rng';
import { STEERING } from './config';
import { createSteering, effectiveSteer, stepSteering, type SteeringState } from './steering';

const DT = 1 / 60;
const run = (s: SteeringState, input: number, steps: number, speed: number): SteeringState => {
  for (let i = 0; i < steps; i++) s = stepSteering(s, input, DT, speed);
  return s;
};

describe('createSteering', () => {
  it('starts centred with a random phase in [0, 2pi)', () => {
    const s = createSteering(createRng(1));
    expect(s.current).toBe(0);
    expect(s.wobblePhase).toBeGreaterThanOrEqual(0);
    expect(s.wobblePhase).toBeLessThan(2 * Math.PI);
    const phases = new Set([1, 2, 3, 4, 5].map((seed) => createSteering(createRng(seed)).wobblePhase));
    expect(phases.size).toBeGreaterThan(1);
    expect(createSteering(createRng(1))).toEqual(s);
  });
  it('uses the full 0..2pi range', () => {
    const max = Math.max(...Array.from({ length: 200 }, (_, i) => createSteering(createRng(i)).wobblePhase));
    expect(max).toBeGreaterThan(5.5);
  });
});

// Equivalent mutant: 'dtS < 0' -> 'dtS <= 0' is unobservable because a dt of 0 changes no state either way.
// Equivalent survivor: steering.ts:16 `dtS < 0` -> `<= 0`; dtS = 0 takes the early return as an unchanged copy, which equals the computed step with dt 0.
describe('stepSteering', () => {
  it('lags behind the input', () => {
    const s = stepSteering({ current: 0, wobblePhase: 0 }, 1, DT, 0);
    expect(s.current).toBeGreaterThan(0);
    expect(s.current).toBeLessThan(0.5);
    expect(s.current).toBeCloseTo(STEERING.lagPerS * DT, 10);
  });
  it('applies the exact lag factor', () => {
    expect(stepSteering({ current: 0.2, wobblePhase: 0 }, -1, 0.1, 0).current).toBeCloseTo(0.2 + (-1.2) * 0.6, 10);
  });
  it('caps the lag factor at 1 for large dt', () => {
    expect(stepSteering({ current: 0, wobblePhase: 0 }, 0.7, 1, 0).current).toBeCloseTo(0.7, 10);
    expect(stepSteering({ current: 0, wobblePhase: 0 }, 0.7, 0.2, 0).current).toBeCloseTo(0.7, 10);
  });
  it('converges to the input within 120 steps', () => {
    expect(Math.abs(run({ current: 0, wobblePhase: 0 }, 1, 120, 0).current - 1)).toBeLessThan(0.01);
  });
  it('clamps input to [-1, 1]', () => {
    const a = stepSteering({ current: 0, wobblePhase: 0 }, 5, DT, 0);
    expect(a).toEqual(stepSteering({ current: 0, wobblePhase: 0 }, 1, DT, 0));
    const b = stepSteering({ current: 0, wobblePhase: 0 }, -5, DT, 0);
    expect(b).toEqual(stepSteering({ current: 0, wobblePhase: 0 }, -1, DT, 0));
    expect(run({ current: 0, wobblePhase: 0 }, 5, 600, 0).current).toBeLessThanOrEqual(1);
  });
  it('advances the wobble phase by 2pi * hz * dt, regardless of speed', () => {
    const expected = 1 + 2 * Math.PI * STEERING.wobbleHz * 0.1;
    expect(stepSteering({ current: 0, wobblePhase: 1 }, 0, 0.1, 0).wobblePhase).toBeCloseTo(expected, 10);
    expect(stepSteering({ current: 0, wobblePhase: 1 }, 0, 0.1, 90).wobblePhase).toBeCloseTo(expected, 10);
  });
  it('leaves state unchanged for non-finite or negative dt, or non-finite input', () => {
    const s = { current: 0.3, wobblePhase: 2 };
    for (const [input, dt] of [[1, NaN], [NaN, DT], [1, Infinity], [Infinity, DT], [-Infinity, DT], [1, -DT]] as Array<[number, number]>) {
      const r = stepSteering(s, input, dt, 50);
      expect(r).toEqual(s);
    }
  });
  it('accepts dt of zero as a no-op step', () => {
    expect(stepSteering({ current: 0.3, wobblePhase: 2 }, 1, 0, 50)).toEqual({ current: 0.3, wobblePhase: 2 });
  });
  it('treats non-finite speed as irrelevant to the step', () => {
    expect(stepSteering({ current: 0, wobblePhase: 0 }, 1, DT, NaN)).toEqual(stepSteering({ current: 0, wobblePhase: 0 }, 1, DT, 0));
  });
  it('does not mutate the input state and returns a new object', () => {
    const s = { current: 0.3, wobblePhase: 2 };
    const r = stepSteering(s, 1, DT, 50);
    expect(s).toEqual({ current: 0.3, wobblePhase: 2 });
    expect(r).not.toBe(s);
    expect(stepSteering(s, NaN, DT, 50)).not.toBe(s);
  });
});

describe('effectiveSteer', () => {
  const at = (phase: number, current = 0) => ({ current, wobblePhase: phase });
  it('has no wobble at speed 0', () => {
    expect(effectiveSteer(at(Math.PI / 2, 0.4), 0)).toBe(0.4);
  });
  it('scales wobble linearly with speed up to wobbleFullAtKmh', () => {
    expect(effectiveSteer(at(Math.PI / 2), 30)).toBeCloseTo(STEERING.wobbleAmplitude / 2, 10);
    expect(effectiveSteer(at(Math.PI / 2), 60)).toBeCloseTo(STEERING.wobbleAmplitude, 10);
    expect(effectiveSteer(at(Math.PI / 2), 120)).toBeCloseTo(STEERING.wobbleAmplitude, 10);
    expect(effectiveSteer(at(-Math.PI / 2), 60)).toBeCloseTo(-STEERING.wobbleAmplitude, 10);
  });
  it('uses the absolute value of negative speed', () => {
    expect(effectiveSteer(at(Math.PI / 2), -30)).toBeCloseTo(STEERING.wobbleAmplitude / 2, 10);
  });
  it('treats non-finite speed as 0', () => {
    expect(effectiveSteer(at(Math.PI / 2, 0.4), NaN)).toBe(0.4);
    expect(effectiveSteer(at(Math.PI / 2, 0.4), Infinity)).toBe(0.4);
  });
  it('clamps to [-1, 1]', () => {
    expect(effectiveSteer(at(Math.PI / 2, 1), 90)).toBe(1);
    expect(effectiveSteer(at(-Math.PI / 2, -1), 90)).toBe(-1);
    expect(effectiveSteer(at(Math.PI / 2, 0.99), 90)).toBe(1);
  });
  it('stays within amplitude of current and actually wobbles at speed', () => {
    let s: SteeringState = { current: 0, wobblePhase: 0.7 };
    let maxDev = 0;
    for (let i = 0; i < 300; i++) {
      s = stepSteering(s, 0, DT, 80);
      const dev = Math.abs(effectiveSteer(s, 80) - s.current);
      expect(dev).toBeLessThanOrEqual(STEERING.wobbleAmplitude + 1e-12);
      maxDev = Math.max(maxDev, dev);
    }
    expect(maxDev).toBeGreaterThan(0.03);
  });
});
