import type { Part } from './damage';
import type { GameMode } from '../shared/modes';
import type { HazardId } from './hazards';

export interface Controls {
  throttle: number; // 0..1
  brake: number; // 0..1
  steer: number; // -1..1
  handbrake: boolean;
}

export type RunPhase = 'menu' | 'driving' | 'paused' | 'wrecked' | 'dnf';

export interface RunStats {
  potholes: number;
  hits: number;
  hazardTypesHit: readonly HazardId[];
  potholeStreakNoSteer: number;
  rolls: number;
  grassS: number;
}

export interface RunState {
  mode: GameMode;
  maxHp: number;
  phase: RunPhase;
  timeS: number;
  health: number;
  damageTaken: number;
  detached: readonly Part[];
  stats: RunStats;
  hitInstanceIds: ReadonlySet<string>;
  lastHazard: HazardId | null;
  clampAbsorbed: boolean; // true once the pre-minimum-wreck-time clamp ever saved the car
}

export type RunEvent =
  | { type: 'start' }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'restart' }
  | { type: 'trafficCollision' }
  | { type: 'tick'; dtS: number; steerInput: number; offRoad?: boolean }
  | { type: 'roll'; speedKmh: number }
  | { type: 'hazardHit'; hazardId: HazardId; instanceId: string; speedKmh: number };

export type RunOutput =
  | { type: 'hazardHit'; hazardId: HazardId; damage: number }
  | { type: 'roll'; damage: number }
  | { type: 'partDetached'; part: Part }
  | { type: 'wrecked'; timeMs: number }
  | { type: 'dnf' };
