import { ROAD } from '../core/config';
import type { Chunk } from '../core/roadgen';

export interface RoadPose { x: number; z: number; heading: number }

const STRAIGHT_EPS = 1e-9;
const SEARCH_RADIUS_M = 60;
const COARSE_STEP_M = 0.5;
const REFINE_ITERATIONS = 40;

interface Segment { startS: number; curvature: number; start: RoadPose }

/** Centreline made of constant-curvature arcs, one per chunk. Heading 0 = -Z, positive = turning right. */
export class RoadPath {
  private readonly segments: Segment[] = [];

  addChunk(chunk: Chunk): void {
    const last = this.segments[this.segments.length - 1];
    const start: RoadPose = last ? this.arc(last, chunk.startS) : { x: 0, z: 0, heading: 0 };
    this.segments.push({ startS: chunk.startS, curvature: chunk.curvature, start });
  }

  get endS(): number {
    const last = this.segments[this.segments.length - 1];
    return last ? last.startS + ROAD.chunkLengthM : 0;
  }

  private arc(seg: Segment, s: number): RoadPose {
    const d = s - seg.startS;
    const { x, z, heading: h0 } = seg.start;
    const k = seg.curvature;
    if (Math.abs(k) < STRAIGHT_EPS) return { x: x + d * Math.sin(h0), z: z - d * Math.cos(h0), heading: h0 };
    const h = h0 + k * d;
    return { x: x + (Math.cos(h0) - Math.cos(h)) / k, z: z - (Math.sin(h) - Math.sin(h0)) / k, heading: h };
  }

  pose(s: number): RoadPose {
    if (s < 0 || s > this.endS) throw new Error(`s=${s} outside road [0, ${this.endS}]`);
    const idx = Math.min(this.segments.length - 1, Math.floor(s / ROAD.chunkLengthM));
    return this.arc(this.segments[idx]!, s);
  }

  toWorld(s: number, lateral: number): { x: number; z: number } {
    const p = this.pose(s);
    return { x: p.x + lateral * Math.cos(p.heading), z: p.z + lateral * Math.sin(p.heading) };
  }

  project(x: number, z: number, hintS: number): { s: number; lateral: number } {
    const lo = Math.max(0, hintS - SEARCH_RADIUS_M);
    const hi = Math.min(this.endS, hintS + SEARCH_RADIUS_M);
    const dist2 = (s: number): number => {
      const p = this.pose(s);
      return (p.x - x) ** 2 + (p.z - z) ** 2;
    };
    let best = lo;
    let bestD = dist2(lo);
    for (let s = lo + COARSE_STEP_M; s < hi; s += COARSE_STEP_M) {
      const d = dist2(s);
      if (d < bestD) { bestD = d; best = s; }
    }
    if (hi > lo && dist2(hi) < bestD) best = hi;
    let a = Math.max(lo, best - COARSE_STEP_M);
    let b = Math.min(hi, best + COARSE_STEP_M);
    for (let i = 0; i < REFINE_ITERATIONS; i++) {
      const m1 = a + (b - a) / 3;
      const m2 = b - (b - a) / 3;
      if (dist2(m1) < dist2(m2)) b = m2; else a = m1;
    }
    const s = (a + b) / 2;
    const p = this.pose(s);
    return { s, lateral: (x - p.x) * Math.cos(p.heading) + (z - p.z) * Math.sin(p.heading) };
  }
}
