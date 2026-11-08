import { MODE_CONFIG, type GameMode } from '../shared/modes';
import { FARA_MAINI, MAX_TICK_S } from './config';
import { applyDamage, hitDamage, newlyDetached } from './damage';
import { getHazard } from './hazards';
import type { RunEvent, RunOutput, RunState } from './types';

export type { RunEvent, RunOutput, RunPhase, RunState, RunStats } from './types';

export function createRun(mode: GameMode = 'classic'): RunState {
  const { maxHp } = MODE_CONFIG[mode];
  return {
    mode,
    maxHp,
    phase: 'menu',
    timeS: 0,
    health: maxHp,
    damageTaken: 0,
    detached: [],
    stats: { potholes: 0, hits: 0, hazardTypesHit: [], potholeStreakNoSteer: 0 },
    hitInstanceIds: new Set<string>(),
    lastHazard: null,
    clampAbsorbed: false,
  };
}

export function scoreTimeMs(state: RunState): number {
  return Math.round(state.timeS * 1000);
}

export interface ApplyResult {
  state: RunState;
  outputs: RunOutput[];
}

function noop(state: RunState): ApplyResult {
  return { state, outputs: [] };
}

function applyTick(state: RunState, dtS: number, steerInput: number): ApplyResult {
  const dt = Number.isFinite(dtS) ? Math.min(MAX_TICK_S, Math.max(0, dtS)) : 0;
  const resets = Number.isFinite(steerInput) && Math.abs(steerInput) >= FARA_MAINI.steerDeadzone;
  return {
    state: {
      ...state,
      timeS: state.timeS + dt,
      stats: resets ? { ...state.stats, potholeStreakNoSteer: 0 } : state.stats,
    },
    outputs: [],
  };
}

function applyHazardHit(state: RunState, event: Extract<RunEvent, { type: 'hazardHit' }>): ApplyResult {
  if (state.hitInstanceIds.has(event.instanceId)) return noop(state);
  const hazard = getHazard(event.hazardId);
  const damage = hitDamage(hazard.tier, event.speedKmh);
  const dmg = applyDamage(state.health, damage, state.timeS, MODE_CONFIG[state.mode].minWreckTimeS);
  const damageTaken = state.maxHp - dmg.health;
  const parts = newlyDetached(state.damageTaken, damageTaken, state.maxHp);
  const isPothole = hazard.kind === 'pothole';
  const next: RunState = {
    ...state,
    phase: dmg.health <= 0 ? 'wrecked' : state.phase,
    health: dmg.health,
    damageTaken,
    detached: [...state.detached, ...parts],
    hitInstanceIds: new Set(state.hitInstanceIds).add(event.instanceId),
    lastHazard: event.hazardId,
    clampAbsorbed: state.clampAbsorbed || dmg.clampAbsorbed,
    stats: {
      potholes: state.stats.potholes + (isPothole ? 1 : 0),
      hits: state.stats.hits + 1,
      hazardTypesHit: state.stats.hazardTypesHit.includes(event.hazardId)
        ? state.stats.hazardTypesHit
        : [...state.stats.hazardTypesHit, event.hazardId],
      potholeStreakNoSteer: state.stats.potholeStreakNoSteer + (isPothole ? 1 : 0),
    },
  };
  const outputs: RunOutput[] = [{ type: 'hazardHit', hazardId: event.hazardId, damage }];
  for (const part of parts) outputs.push({ type: 'partDetached', part });
  if (next.phase === 'wrecked') outputs.push({ type: 'wrecked', timeMs: scoreTimeMs(next) });
  return { state: next, outputs };
}

export function applyEvent(state: RunState, event: RunEvent): ApplyResult {
  switch (event.type) {
    case 'start':
      return state.phase === 'menu' ? { state: { ...state, phase: 'driving' }, outputs: [] } : noop(state);
    case 'pause':
      return state.phase === 'driving' ? { state: { ...state, phase: 'paused' }, outputs: [] } : noop(state);
    case 'resume':
      return state.phase === 'paused' ? { state: { ...state, phase: 'driving' }, outputs: [] } : noop(state);
    case 'restart':
      return state.phase === 'menu' ? noop(state) : { state: { ...createRun(state.mode), phase: 'driving' }, outputs: [] };
    case 'trafficCollision':
      return state.phase === 'driving' ? { state: { ...state, phase: 'dnf' }, outputs: [{ type: 'dnf' }] } : noop(state);
    case 'tick':
      return state.phase === 'driving' ? applyTick(state, event.dtS, event.steerInput) : noop(state);
    case 'hazardHit':
      return state.phase === 'driving' ? applyHazardHit(state, event) : noop(state);
  }
}
