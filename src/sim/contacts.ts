import type { HazardSpawn } from '../core/roadgen';

export const CAR_HALF_WIDTH_M = 0.8;
export const CAR_HALF_LENGTH_M = 2.0;
export const HAZARD_RADIUS_M = 0.6;
const DEFAULT_LANE_OFFSET_M = 1.75;

/** Hazards swept by the car this step: s in (prevS - halfLength, s + halfLength], within the car width + hazard radius. */
export function hazardContacts(prevS: number, s: number, lateral: number, hazards: readonly HazardSpawn[]): HazardSpawn[] {
  return hazards.filter(
    (h) =>
      h.s > prevS - CAR_HALF_LENGTH_M &&
      h.s <= s + CAR_HALF_LENGTH_M &&
      Math.abs(h.lateral - lateral) <= CAR_HALF_WIDTH_M + HAZARD_RADIUS_M,
  );
}

/** Overlap of two car-sized boxes in (s, lateral); traffic car centre lateral = lane * laneOffsetM. */
export function trafficCollision(
  s: number,
  lateral: number,
  cars: readonly { s: number; lane: 1 | -1 }[],
  laneOffsetM: number = DEFAULT_LANE_OFFSET_M,
): boolean {
  return cars.some(
    (c) =>
      Math.abs(c.s - s) < 2 * CAR_HALF_LENGTH_M &&
      Math.abs(c.lane * laneOffsetM - lateral) < 2 * CAR_HALF_WIDTH_M,
  );
}
