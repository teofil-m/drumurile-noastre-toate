import { describe, it, expect } from 'vitest';
import { applyDamage, hitDamage, newlyDetached, speedFactor } from './damage';
import { PART_THRESHOLDS, SPEED_FACTOR, TIER_DAMAGE } from './config';

describe('damage', () => {
  it.each([[50, 1], [0, 0.3], [15, 0.3], [75, 1.5], [100, 2], [200, 2], [NaN, 0.3], [-30, 0.3], [Infinity, 2]])('speedFactor(%p) = %p', (s, f) => {
    expect(speedFactor(s)).toBeCloseTo(f, 10);
  });
  it.each([['large', 50, 50], ['small', 0, 3], ['epic', 110, 240], ['medium', 75, 38], ['small', NaN, 3]] as const)('hitDamage(%s,%p) = %p', (t, s, d) => {
    expect(hitDamage(t, s)).toBe(d);
  });
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
  it('pins config values', () => {
    expect(SPEED_FACTOR).toEqual({ divisorKmh: 50, min: 0.3, max: 2.0 });
    expect(TIER_DAMAGE).toEqual({ small: 10, medium: 25, large: 50, epic: 120 });
    expect(PART_THRESHOLDS).toEqual([
      { part: 'bumper', damageTaken: 200 }, { part: 'hood', damageTaken: 400 }, { part: 'doorLeft', damageTaken: 550 },
      { part: 'doorRight', damageTaken: 700 }, { part: 'exhaust', damageTaken: 850 }, { part: 'transmission', damageTaken: 950 },
    ]);
  });
});
