import { describe, it, expect } from 'vitest';
import { applyDamage, hitDamage, newlyDetached, speedTerm } from './damage';
import { DAMAGE_COEF, PART_FRACTIONS, PART_THRESHOLDS, ROLL_DAMAGE, SPEED_FACTOR, TIER_DAMAGE } from './config';

describe('damage', () => {
  it.each([[110, 1], [0, 0.1 ** 1.5], [5, 0.1 ** 1.5], [55, 0.5 ** 1.5], [82.5, 0.75 ** 1.5], [200, 1], [NaN, 0.1 ** 1.5], [-30, 0.1 ** 1.5], [Infinity, 1]])('speedTerm(%p) = %p', (s, f) => {
    expect(speedTerm(s)).toBeCloseTo(f, 10);
  });
  it.each([['large', 110], ['small', 110], ['epic', 110], ['medium', 110], ['small', 0], ['epic', 55], ['medium', 82.5], ['small', NaN]] as const)('hitDamage(%s,%p) = round(tier*coef*term)', (t, s) => {
    expect(hitDamage(t, s)).toBe(Math.round(TIER_DAMAGE[t] * DAMAGE_COEF * speedTerm(s)));
  });
  it('pins DAMAGE_COEF and top-speed tier damage', () => {
    expect(DAMAGE_COEF).toBe(1.25);
    expect(['small', 'medium', 'large', 'epic'].map((x) => hitDamage(x as 'small', 110))).toEqual([13, 31, 63, 150]);
  });
  it('pins ROLL_DAMAGE', () => { expect(ROLL_DAMAGE).toBe(80); });
  it('subtracts damage normally', () => { expect(applyDamage(1000, 50, 0)).toEqual({ health: 950, clampAbsorbed: false }); });
  it('clamps to 1 HP before the minimum wreck time', () => {
    expect(applyDamage(10, 50, 179.99)).toEqual({ health: 1, clampAbsorbed: true });
    expect(applyDamage(51, 50, 10)).toEqual({ health: 1, clampAbsorbed: false });
    expect(applyDamage(1, 50, 100)).toEqual({ health: 1, clampAbsorbed: true });
  });
  it('zero damage on a sub-1 HP car still applies the pre-minimum clamp', () => { expect(applyDamage(0, 0, 10)).toEqual({ health: 1, clampAbsorbed: true }); });
  it('allows wreck at and after the minimum wreck time', () => { expect(applyDamage(10, 50, 180)).toEqual({ health: 0, clampAbsorbed: false }); });
  it('never returns NaN health', () => {
    expect(applyDamage(500, NaN, 200).health).toBe(500);
    expect(applyDamage(500, -5, 200)).toEqual({ health: 500, clampAbsorbed: false });
    expect(applyDamage(500, Infinity, 10)).toEqual({ health: 500, clampAbsorbed: false });
  });
  it('detaches parts crossing thresholds, once, in order', () => {
    expect(newlyDetached(150, 250)).toEqual(['bumper']);
    expect(newlyDetached(200, 399)).toEqual([]);
    expect(newlyDetached(199, 200)).toEqual(['bumper']);
    expect(newlyDetached(0, 1000)).toEqual(['bumper', 'hood', 'doorLeft', 'doorRight', 'exhaust', 'transmission']);
  });
  // SPEED_FACTOR tuned in Task 11 (divisor 110 = TOP_SPEED_KMH, min 0.1, max 1) so tiers apply at top speed (AC 12).
  it('pins config values', () => {
    expect(SPEED_FACTOR).toEqual({ divisorKmh: 110, min: 0.1, max: 1.0 });
    expect(TIER_DAMAGE).toEqual({ small: 10, medium: 25, large: 50, epic: 120 });
    expect(PART_THRESHOLDS).toEqual([
      { part: 'bumper', damageTaken: 200 }, { part: 'hood', damageTaken: 400 }, { part: 'doorLeft', damageTaken: 550 },
      { part: 'doorRight', damageTaken: 700 }, { part: 'exhaust', damageTaken: 850 }, { part: 'transmission', damageTaken: 950 },
    ]);
  });
  it('pins the part fractions and keeps classic thresholds equal to fractions x 1000', () => {
    expect(PART_FRACTIONS).toEqual([
      { part: 'bumper', fraction: 0.2 }, { part: 'hood', fraction: 0.4 }, { part: 'doorLeft', fraction: 0.55 },
      { part: 'doorRight', fraction: 0.7 }, { part: 'exhaust', fraction: 0.85 }, { part: 'transmission', fraction: 0.95 },
    ]);
    expect(PART_FRACTIONS.map((f) => ({ part: f.part, damageTaken: Math.round(f.fraction * 1000) }))).toEqual(PART_THRESHOLDS);
  });
  it('scales part detachment with maxHp (300 HP)', () => {
    expect(newlyDetached(0, 59, 300)).toEqual([]);
    expect(newlyDetached(59, 60, 300)).toEqual(['bumper']);
    expect(newlyDetached(0, 120, 300)).toEqual(['bumper', 'hood']);
    expect(newlyDetached(164, 165, 300)).toEqual(['doorLeft']);
    expect(newlyDetached(209, 210, 300)).toEqual(['doorRight']);
    expect(newlyDetached(254, 255, 300)).toEqual(['exhaust']);
    expect(newlyDetached(284, 285, 300)).toEqual(['transmission']);
    expect(newlyDetached(0, 300, 300)).toEqual(['bumper', 'hood', 'doorLeft', 'doorRight', 'exhaust', 'transmission']);
  });
  it('uses a per-mode minimum wreck time floor', () => {
    expect(applyDamage(10, 50, 59.99, 60)).toEqual({ health: 1, clampAbsorbed: true });
    expect(applyDamage(10, 50, 60, 60)).toEqual({ health: 0, clampAbsorbed: false });
    expect(applyDamage(10, 50, 100)).toEqual({ health: 1, clampAbsorbed: true });
  });
});
