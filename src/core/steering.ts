import { STEERING } from './config';
import type { Rng } from './rng';

export interface SteeringState {
  current: number;
  wobblePhase: number;
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

export function createSteering(rng: Rng): SteeringState {
  return { current: 0, wobblePhase: rng.range(0, 2 * Math.PI) };
}

export function stepSteering(state: SteeringState, inputSteer: number, dtS: number, _speedKmh: number): SteeringState {
  if (!Number.isFinite(dtS) || dtS < 0 || !Number.isFinite(inputSteer)) return { ...state };
  const input = clamp(inputSteer, -1, 1);
  const current = state.current + (input - state.current) * Math.min(1, STEERING.lagPerS * dtS);
  const wobblePhase = state.wobblePhase + 2 * Math.PI * STEERING.wobbleHz * dtS;
  return { current, wobblePhase };
}

export function effectiveSteer(state: SteeringState, speedKmh: number): number {
  const speed = Number.isFinite(speedKmh) ? Math.abs(speedKmh) : 0;
  const wobble = STEERING.wobbleAmplitude * Math.min(1, speed / STEERING.wobbleFullAtKmh) * Math.sin(state.wobblePhase);
  return clamp(state.current + wobble, -1, 1);
}
