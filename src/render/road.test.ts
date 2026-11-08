import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ROAD } from '../core/config';
import type { Chunk } from '../core/roadgen';
import { RoadPath } from '../sim/roadPath';
import { createRoadMeshForChunk } from './road';

describe('createRoadMeshForChunk', () => {
  it('follows path.toWorld for a straight chunk', () => {
    const chunk: Chunk = { index: 0, startS: 0, curvature: 0, hazards: [], traffic: [] };
    const path = new RoadPath();
    path.addChunk(chunk);
    const group = createRoadMeshForChunk(chunk, path);
    const road = group.getObjectByName('road') as THREE.Mesh;
    const pos = road.geometry.getAttribute('position');
    const has = (x: number, z: number): boolean => {
      for (let i = 0; i < pos.count; i++) {
        if (Math.abs(pos.getX(i) - x) < 1e-6 && Math.abs(pos.getZ(i) - z) < 1e-6 && Math.abs(pos.getY(i)) < 1e-6) return true;
      }
      return false;
    };
    expect(has(ROAD.halfWidthM, -10)).toBe(true);
    expect(has(-ROAD.halfWidthM, -10)).toBe(true);
  });
});
