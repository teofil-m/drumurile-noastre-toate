import { MODE_CONFIG } from '../shared/modes';
import { MAX_HP, PART_FRACTIONS, SPEED_FACTOR, TIER_DAMAGE } from './config';
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

export function applyDamage(health: number, dmg: number, runTimeS: number, minWreckTimeS: number = MODE_CONFIG.classic.minWreckTimeS): DamageResult {
  if (!Number.isFinite(dmg) || dmg < 0) return { health, clampAbsorbed: false };
  const next = health - dmg;
  if (runTimeS < minWreckTimeS && next < 1) {
    return { health: 1, clampAbsorbed: true };
  }
  return { health: Math.max(0, next), clampAbsorbed: false };
}

export function newlyDetached(prevTaken: number, nextTaken: number, maxHp: number = MAX_HP): Part[] {
  return PART_FRACTIONS.filter((f) => {
    const threshold = Math.round(f.fraction * maxHp);
    return prevTaken < threshold && threshold <= nextTaken;
  }).map((f) => f.part);
}
