import { HAZARD_WEIGHTS, ROAD, TRAFFIC } from './config';
import { hazardDensityPer100m, trafficDensityPer100m } from './difficulty';
import { HAZARD_IDS, getHazard, type HazardId } from './hazards';
import { createRng, hashSeed, type Rng } from './rng';

/**
 * Conventions: `lateral` is metres from the road centreline, + = right of centre in the driving direction.
 * `lane: 1` = right lane, same direction as the player (Romania drives on the right); `-1` = left lane, oncoming.
 * `curvature` is 1/m, + = road bends right.
 */
export interface HazardSpawn { instanceId: string; hazardId: HazardId; s: number; lateral: number }
export interface TrafficSpawn { instanceId: string; s: number; lane: 1 | -1; speedKmh: number }
export interface Chunk { index: number; startS: number; curvature: number; hazards: HazardSpawn[]; traffic: TrafficSpawn[] }

const MAX_PLACEMENT_TRIES = 20;
const NON_CURB_EDGE_INSET_M = 0.5;

function countFor(densityPer100m: number, rng: Rng): number {
  const expected = (densityPer100m * ROAD.chunkLengthM) / 100;
  const whole = Math.floor(expected);
  return whole + (rng.next() < expected - whole ? 1 : 0);
}

export function generateChunk(seed: number, index: number, tS: number): Chunk {
  const rng = createRng(hashSeed(seed, index));
  const startS = index * ROAD.chunkLengthM;
  if (index === 0) return { index, startS, curvature: 0, hazards: [], traffic: [] };

  const curvature = rng.range(-ROAD.maxCurvature, ROAD.maxCurvature);
  const minS = startS + ROAD.chunkMarginM;
  const maxS = startS + ROAD.chunkLengthM - ROAD.chunkMarginM;
  const bend = Math.abs(curvature) > ROAD.bendThreshold;
  const table = HAZARD_IDS.map((id) => ({
    weight: HAZARD_WEIGHTS[id] * (bend && getHazard(id).kind === 'curb' ? ROAD.bendCurbMultiplier : 1),
    value: id,
  }));

  const hazards: HazardSpawn[] = [];
  const hazardCount = countFor(hazardDensityPer100m(tS), rng);
  for (let n = 0; n < hazardCount; n++) {
    let s: number | undefined;
    for (let t = 0; t < MAX_PLACEMENT_TRIES && s === undefined; t++) {
      const candidate = rng.range(minS, maxS);
      if (hazards.every((h) => Math.abs(h.s - candidate) >= ROAD.minHazardSpacingM)) s = candidate;
    }
    if (s === undefined) continue;
    const hazardId = rng.pick(table);
    const lateral =
      getHazard(hazardId).kind === 'curb'
        ? (rng.next() < 0.5 ? -ROAD.halfWidthM : ROAD.halfWidthM)
        : rng.range(-(ROAD.halfWidthM - NON_CURB_EDGE_INSET_M), ROAD.halfWidthM - NON_CURB_EDGE_INSET_M);
    hazards.push({ instanceId: `${index}-h${hazards.length}`, hazardId, s, lateral });
  }

  const traffic: TrafficSpawn[] = [];
  const trafficCount = countFor(trafficDensityPer100m(tS), rng);
  for (let i = 0; i < trafficCount; i++) {
    const s = rng.range(minS, maxS);
    const lane = rng.next() < 0.5 ? 1 : -1;
    const [lo, hi] = lane === 1 ? TRAFFIC.sameDirKmh : TRAFFIC.oncomingKmh;
    traffic.push({ instanceId: `${index}-t${i}`, s, lane, speedKmh: rng.range(lo, hi) });
  }

  return { index, startS, curvature, hazards, traffic };
}
