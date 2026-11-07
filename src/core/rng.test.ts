import { describe, it, expect } from 'vitest';
import { createRng, hashSeed } from './rng';

describe('rng', () => {
  it('is deterministic per seed', () => {
    const a = createRng(42), b = createRng(42);
    expect([a.next(), a.next(), a.next()]).toEqual([b.next(), b.next(), b.next()]);
  });
  it('differs between seeds', () => { expect(createRng(1).next()).not.toBe(createRng(2).next()); });
  it('next stays in [0,1)', () => { const r = createRng(7); for (let i = 0; i < 10_000; i++) { const v = r.next(); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(1); } });
  it('range and int respect bounds', () => { const r = createRng(3); for (let i = 0; i < 5_000; i++) { const x = r.range(-2, 5); expect(x).toBeGreaterThanOrEqual(-2); expect(x).toBeLessThan(5); const n = r.int(1, 4); expect([1, 2, 3]).toContain(n); } });
  it('int reaches both ends', () => { const r = createRng(9); const seen = new Set<number>(); for (let i = 0; i < 1_000; i++) seen.add(r.int(0, 3)); expect([...seen].sort()).toEqual([0, 1, 2]); });
  it('pick follows weights', () => {
    const r = createRng(5); const c = { a: 0, b: 0, z: 0 };
    for (let i = 0; i < 20_000; i++) c[r.pick([{ weight: 3, value: 'a' as const }, { weight: 1, value: 'b' as const }, { weight: 0, value: 'z' as const }])]++;
    expect(c.a / 20_000).toBeCloseTo(0.75, 1); expect(c.z).toBe(0);
  });
  it('hashSeed is deterministic, order-sensitive, uint32', () => {
    expect(hashSeed(1, 2)).toBe(hashSeed(1, 2)); expect(hashSeed(1, 2)).not.toBe(hashSeed(2, 1));
    const h = hashSeed(123, 456); expect(Number.isInteger(h)).toBe(true); expect(h).toBeGreaterThanOrEqual(0); expect(h).toBeLessThan(2 ** 32);
  });
  it('produces the reference mulberry32 sequence', () => {
    const r = createRng(42);
    expect([r.next(), r.next(), r.next()]).toEqual([0.6011037519201636, 0.44829055899754167, 0.8524657934904099]);
  });
  it('hashSeed matches reference values', () => {
    expect(hashSeed(1, 2)).toBe(1269123516);
    expect(hashSeed()).toBe(2166136261);
  });
  it('pick throws when there is nothing to pick', () => {
    expect(() => createRng(1).pick([])).toThrow('pick: no items with positive weight');
  });
});
