import { MODE_CONFIG, type GameMode } from '../shared/modes';
import { FARA_MAINI, MAX_TICK_S, DAMAGE_COEF, ROLL_DAMAGE } from './config';
import { applyDamage, hitDamage, newlyDetached, speedTerm } from './damage';
import type { Part } from './damage';
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
    stats: { potholes: 0, hits: 0, hazardTypesHit: [], potholeStreakNoSteer: 0, rolls: 0, grassS: 0 },
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

function applyTick(state: RunState, dtS: number, steerInput: number, offRoad: boolean): ApplyResult {
  const dt = Number.isFinite(dtS) ? Math.min(MAX_TICK_S, Math.max(0, dtS)) : 0;
  const resets = Number.isFinite(steerInput) && Math.abs(steerInput) >= FARA_MAINI.steerDeadzone;
  return {
    state: {
      ...state,
      timeS: state.timeS + dt,
      stats: {
        ...state.stats,
        potholeStreakNoSteer: resets ? 0 : state.stats.potholeStreakNoSteer,
        grassS: state.stats.grassS + (offRoad ? dt : 0),
      },
    },
    outputs: [],
  };
}

interface HitOutcome {
  next: RunState;
  parts: Part[];
}

// Shared damage block: health/clamp, part detachment and the wrecked phase; callers add their own stats/outputs.
function applyHit(state: RunState, damage: number): HitOutcome {
  const dmg = applyDamage(state.health, damage, state.timeS, MODE_CONFIG[state.mode].minWreckTimeS);
  const damageTaken = state.maxHp - dmg.health;
  const parts = newlyDetached(state.damageTaken, damageTaken, state.maxHp);
  const next: RunState = {
    ...state,
    phase: dmg.health <= 0 ? 'wrecked' : state.phase,
    health: dmg.health,
    damageTaken,
    detached: [...state.detached, ...parts],
    clampAbsorbed: state.clampAbsorbed || dmg.clampAbsorbed,
  };
  return { next, parts };
}

function hitOutputs(first: RunOutput, next: RunState, parts: Part[]): RunOutput[] {
  const outputs: RunOutput[] = [first];
  for (const part of parts) outputs.push({ type: 'partDetached', part });
  if (next.phase === 'wrecked') outputs.push({ type: 'wrecked', timeMs: scoreTimeMs(next) });
  return outputs;
}

function applyHazardHit(state: RunState, event: Extract<RunEvent, { type: 'hazardHit' }>): ApplyResult {
  if (state.hitInstanceIds.has(event.instanceId)) return noop(state);
  const hazard = getHazard(event.hazardId);
  const damage = hitDamage(hazard.tier, event.speedKmh);
  const { next: hit, parts } = applyHit(state, damage);
  const isPothole = hazard.kind === 'pothole';
  const next: RunState = {
    ...hit,
    hitInstanceIds: new Set(state.hitInstanceIds).add(event.instanceId),
    lastHazard: event.hazardId,
    stats: {
      ...state.stats,
      potholes: state.stats.potholes + (isPothole ? 1 : 0),
      hits: state.stats.hits + 1,
      hazardTypesHit: state.stats.hazardTypesHit.includes(event.hazardId)
        ? state.stats.hazardTypesHit
        : [...state.stats.hazardTypesHit, event.hazardId],
      potholeStreakNoSteer: state.stats.potholeStreakNoSteer + (isPothole ? 1 : 0),
    },
  };
  return { state: next, outputs: hitOutputs({ type: 'hazardHit', hazardId: event.hazardId, damage }, next, parts) };
}

function applyRoll(state: RunState, event: Extract<RunEvent, { type: 'roll' }>): ApplyResult {
  const damage = Math.round(ROLL_DAMAGE * DAMAGE_COEF * speedTerm(event.speedKmh));
  const { next: hit, parts } = applyHit(state, damage);
  const next: RunState = { ...hit, stats: { ...state.stats, rolls: state.stats.rolls + 1 } };
  return { state: next, outputs: hitOutputs({ type: 'roll', damage }, next, parts) };
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
      return state.phase === 'driving' ? applyTick(state, event.dtS, event.steerInput, event.offRoad === true) : noop(state);
    case 'hazardHit':
      return state.phase === 'driving' ? applyHazardHit(state, event) : noop(state);
    case 'roll':
      return state.phase === 'driving' ? applyRoll(state, event) : noop(state);
  }
}
