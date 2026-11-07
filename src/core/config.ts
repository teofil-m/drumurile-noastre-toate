import type { HazardId, Tier } from './hazards';
import type { Part } from './damage';

export const MAX_HP = 1000;
export const TIER_DAMAGE: Record<Tier, number> = { small: 10, medium: 25, large: 50, epic: 120 };
export const SPEED_FACTOR = { divisorKmh: 110, min: 0.1, max: 1.0 };
export const TOP_SPEED_KMH = 110;
export const MAX_TICK_S = 0.25;
export const RAMP = { fullAtS: 300, hazardBase: 1, hazardExtra: 1.4, hazardExponent: 1.5, trafficBase: 0.1, trafficExtra: 1.2 };
export const ROAD = { chunkLengthM: 50, halfWidthM: 3.5, minHazardSpacingM: 6, chunkMarginM: 3, maxCurvature: 0.02, bendThreshold: 0.01, bendCurbMultiplier: 3 };
export const HAZARD_WEIGHTS: Record<HazardId, number> = {
  gropita: 45,
  gropality: 10,
  'groapa-de-gunoi': 3,
  'craterul-national': 0.5,
  'bordura-protocol': 20,
  'bordura-everest': 1,
  'capac-dansator': 20,
  'gura-iadului': 0.5,
};
export const TRAFFIC = { sameDirKmh: [40, 70], oncomingKmh: [40, 80] } as const;
export const STEERING = { lagPerS: 6, wobbleAmplitude: 0.06, wobbleHz: 1.3, wobbleFullAtKmh: 60 };
export const FARA_MAINI = { streak: 5, steerDeadzone: 0.1 };
export const PART_THRESHOLDS: ReadonlyArray<{ part: Part; damageTaken: number }> = [
  { part: 'bumper', damageTaken: 200 },
  { part: 'hood', damageTaken: 400 },
  { part: 'doorLeft', damageTaken: 550 },
  { part: 'doorRight', damageTaken: 700 },
  { part: 'exhaust', damageTaken: 850 },
  { part: 'transmission', damageTaken: 950 },
];
