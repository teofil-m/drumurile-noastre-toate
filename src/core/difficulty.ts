import { RAMP } from './config';

export function rampProgress(tS: number): number {
  if (!Number.isFinite(tS) || tS < 0) return 0;
  return Math.min(tS / RAMP.fullAtS, 1);
}

export function hazardDensityPer100m(tS: number): number {
  return RAMP.hazardBase + RAMP.hazardExtra * rampProgress(tS) ** RAMP.hazardExponent;
}

export function trafficDensityPer100m(tS: number): number {
  return RAMP.trafficBase + RAMP.trafficExtra * rampProgress(tS);
}
