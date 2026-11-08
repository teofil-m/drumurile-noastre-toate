import type { GameMode } from '../shared/modes';
import { ROAD, TOP_SPEED_KMH } from './config';
import { generateChunk, type Chunk, type HazardSpawn } from './roadgen';
import { applyEvent, createRun } from './run';

export interface BotResult { wreckTimeS: number | null; clampAbsorbed: boolean; potholes: number; hits: number }

export const BOT = { lateralSpeedMps: 2.5, hitToleranceM: 0.9, dtS: 1 / 60 };

const TARGET_EDGE_INSET_M = 0.5;
const LOOK_AHEAD_CHUNKS = 1;

export interface BotOptions { lateralSpeedMps?: number; hitToleranceM?: number; mode?: GameMode }

export function simulateGreedyBot(seed: number, maxTimeS = 600, opts: BotOptions = {}): BotResult {
  const lateralSpeedMps = opts.lateralSpeedMps ?? BOT.lateralSpeedMps;
  const hitToleranceM = opts.hitToleranceM ?? BOT.hitToleranceM;
  let state = applyEvent(createRun(opts.mode), { type: 'start' }).state;
  const chunks = new Map<number, Chunk>();
  const chunkAt = (index: number): Chunk => {
    let chunk = chunks.get(index);
    if (!chunk) {
      chunk = generateChunk(seed, index, state.timeS);
      chunks.set(index, chunk);
    }
    return chunk;
  };

  const speedMps = TOP_SPEED_KMH / 3.6;
  const maxReach = ROAD.halfWidthM - TARGET_EDGE_INSET_M;
  let s = 0;
  let lateral = 0;

  while (state.phase !== 'wrecked' && state.timeS < maxTimeS) {
    state = applyEvent(state, { type: 'tick', dtS: BOT.dtS, steerInput: 0 }).state;
    const prevS = s;
    s += speedMps * BOT.dtS;

    const index = Math.floor(s / ROAD.chunkLengthM);
    let target: HazardSpawn | undefined;
    for (let i = index; i <= index + LOOK_AHEAD_CHUNKS && !target; i++) {
      target = chunkAt(i).hazards.filter((h) => h.s > s).sort((a, b) => a.s - b.s)[0];
    }
    if (target) {
      const goal = Math.min(maxReach, Math.max(-maxReach, target.lateral));
      const maxStep = lateralSpeedMps * BOT.dtS;
      lateral += Math.min(maxStep, Math.max(-maxStep, goal - lateral));
    }

    for (const h of chunkAt(index).hazards) {
      if (h.s > prevS && h.s <= s && Math.abs(lateral - h.lateral) <= hitToleranceM) {
        state = applyEvent(state, { type: 'hazardHit', hazardId: h.hazardId, instanceId: h.instanceId, speedKmh: TOP_SPEED_KMH }).state;
      }
    }
  }

  return {
    wreckTimeS: state.phase === 'wrecked' ? state.timeS : null,
    clampAbsorbed: state.clampAbsorbed,
    potholes: state.stats.potholes,
    hits: state.stats.hits,
  };
}
