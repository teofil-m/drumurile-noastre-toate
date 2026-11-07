import { MIN_WRECK_TIME_S } from '../shared/constants';
import { PART_THRESHOLDS, SPEED_FACTOR, TIER_DAMAGE } from './config';
import type { Tier } from './hazards';

export type Part = 'bumper' | 'hood' | 'doorLeft' | 'doorRight' | 'exhaust' | 'transmission';

export interface DamageResult {
  health: number;
  clampAbsorbed: boolean;
}

export function speedFactor(speedKmh: number): number {
  const s = Number.isNaN(speedKmh) ? 0 : speedKmh;
  return Math.min(SPEED_FACTOR.max, Math.max(SPEED_FACTOR.min, s / SPEED_FACTOR.divisorKmh));
}

export function hitDamage(tier: Tier, speedKmh: number): number {
  return Math.round(TIER_DAMAGE[tier] * speedFactor(speedKmh));
}

export function applyDamage(health: number, dmg: number, runTimeS: number): DamageResult {
  if (!Number.isFinite(dmg) || dmg < 0) return { health, clampAbsorbed: false };
  const next = health - dmg;
  if (runTimeS < MIN_WRECK_TIME_S && next < 1) {
    return { health: 1, clampAbsorbed: true };
  }
  return { health: Math.max(0, next), clampAbsorbed: false };
}

export function newlyDetached(prevTaken: number, nextTaken: number): Part[] {
  return PART_THRESHOLDS.filter((t) => prevTaken < t.damageTaken && t.damageTaken <= nextTaken).map((t) => t.part);
}
