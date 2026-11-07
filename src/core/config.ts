import type { HazardId, Tier } from './hazards';

export const MAX_HP = 1000;
export const TIER_DAMAGE: Record<Tier, number> = { small: 10, medium: 25, large: 50, epic: 120 };
export const SPEED_FACTOR = { divisorKmh: 50, min: 0.3, max: 2.0 };
export const TOP_SPEED_KMH = 110;
export const MAX_TICK_S = 0.25;
export const RAMP = { fullAtS: 300, hazardBase: 0.6, hazardExtra: 6.4, hazardExponent: 1.5, trafficBase: 0.1, trafficExtra: 1.2 };
export const ROAD = { chunkLengthM: 50, halfWidthM: 3.5, minHazardSpacingM: 6, chunkMarginM: 3, maxCurvature: 0.02, bendThreshold: 0.01, bendCurbMultiplier: 3 };
export const HAZARD_WEIGHTS: Record<HazardId, number> = {
  gropita: 30,
  gropality: 25,
  'groapa-de-gunoi': 15,
  'craterul-national': 4,
  'bordura-protocol': 10,
  'bordura-everest': 4,
  'capac-dansator': 8,
  'gura-iadului': 4,
};
export const TRAFFIC = { sameDirKmh: [40, 70], oncomingKmh: [40, 80] } as const;
export const STEERING = { lagPerS: 6, wobbleAmplitude: 0.06, wobbleHz: 1.3, wobbleFullAtKmh: 60 };
export const FARA_MAINI = { streak: 5, steerDeadzone: 0.1 };
