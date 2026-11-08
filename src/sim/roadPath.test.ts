import { describe, expect, it } from 'vitest';
import type { Chunk } from '../core/roadgen';
import { RoadPath } from './roadPath';

const chunk = (index: number, curvature: number): Chunk => ({ index, startS: index * 50, curvature, hazards: [], traffic: [] });

function pathOf(...curv: number[]): RoadPath {
  const p = new RoadPath();
  curv.forEach((k, i) => p.addChunk(chunk(i, k)));
  return p;
}

describe('RoadPath', () => {
  it('straight chunk runs along -Z', () => {
    const p = pathOf(0);
    expect(p.toWorld(10, 0).x).toBeCloseTo(0, 9);
    expect(p.toWorld(10, 0).z).toBeCloseTo(-10, 9);
    expect(p.toWorld(10, 2).x).toBeCloseTo(2, 9);
    expect(p.toWorld(10, 2).z).toBeCloseTo(-10, 9);
    expect(p.pose(10).heading).toBe(0);
  });

  it('a right-bending chunk turns right (heading and x grow)', () => {
    const p = pathOf(0, 0.02);
    const end = p.pose(100);
    expect(end.heading).toBeCloseTo(1, 9);
    expect(end.x).toBeGreaterThan(0);
    expect(p.pose(75).heading).toBeCloseTo(0.5, 9);
  });

  it('a left-bending chunk turns left', () => {
    const p = pathOf(0, -0.02);
    expect(p.pose(100).heading).toBeLessThan(0);
    expect(p.pose(100).x).toBeLessThan(0);
  });

  it('matches the arc formula', () => {
    const p = pathOf(0, 0.02);
    const e = p.pose(100); // radius 50, quarter-ish arc of 1 rad
    expect(e.x).toBeCloseTo(50 * (1 - Math.cos(1)), 9);
    expect(e.z).toBeCloseTo(-50 - 50 * Math.sin(1), 9);
  });

  it('lateral is to the right of heading on curves', () => {
    const p = pathOf(0, 0.02);
    const c = p.pose(100);
    const w = p.toWorld(100, 2);
    expect(w.x).toBeCloseTo(c.x + 2 * Math.cos(c.heading), 9);
    expect(w.z).toBeCloseTo(c.z + 2 * Math.sin(c.heading), 9);
  });

  it('pose throws beyond added chunks and for negative s', () => {
    const p = pathOf(0);
    expect(() => p.pose(50.5)).toThrow();
    expect(() => p.pose(-1)).toThrow();
    expect(() => p.pose(50)).not.toThrow();
    expect(() => p.pose(0)).not.toThrow();
  });

  it('is continuous across chunk boundaries', () => {
    const p = pathOf(0, 0.02, -0.015);
    for (const b of [50, 100]) {
      const a = p.pose(b - 1e-6);
      const c = p.pose(b + 1e-6);
      expect(c.x).toBeCloseTo(a.x, 4);
      expect(c.z).toBeCloseTo(a.z, 4);
      expect(c.heading).toBeCloseTo(a.heading, 4);
    }
  });

  it('project inverts toWorld on straight and curved roads', () => {
    const p = pathOf(0, 0.02, -0.02, 0.01, 0);
    for (const [s, lat] of [[10, 0], [37.3, 2], [75, -3], [120.2, 1.5], [180, -0.4], [225, 3]] as const) {
      const w = p.toWorld(s, lat);
      const r = p.project(w.x, w.z, s - 7);
      expect(Math.abs(r.s - s)).toBeLessThan(0.01);
      expect(Math.abs(r.lateral - lat)).toBeLessThan(0.01);
    }
  });

  it('project clamps to the available road', () => {
    const p = pathOf(0);
    const r = p.project(0, 100, 20);
    expect(r.s).toBeCloseTo(0, 6);
    const r2 = p.project(0, -80, 40);
    expect(r2.s).toBeCloseTo(50, 6);
  });

  it('project only searches near the hint', () => {
    const p = pathOf(0, 0, 0, 0, 0, 0);
    const w = p.toWorld(250, 0);
    expect(p.project(w.x, w.z, 10).s).toBeLessThan(80);
  });
});
