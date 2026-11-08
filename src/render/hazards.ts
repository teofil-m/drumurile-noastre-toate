import * as THREE from 'three';
import { getHazard, type Tier } from '../core/hazards';
import type { Chunk } from '../core/roadgen';
import type { RoadPath } from '../sim/roadPath';
import { hashString, rng } from './util';

const POTHOLE_DIAMETER_M: Record<Tier, number> = { small: 0.6, medium: 1.0, large: 1.6, epic: 2.5 };
const POTHOLE_COLOR: Record<Tier, number> = { small: 0x2e2e32, medium: 0x25252a, large: 0x1a1a1e, epic: 0x0c0c0f };
const CURB_HEIGHT_M: Record<string, number> = { 'bordura-protocol': 0.12, 'bordura-everest': 0.3 };
const CURB_LENGTH_M = 2;
const CURB_WIDTH_M = 0.4;

function irregularDisc(diameter: number, seed: number, y: number, color: number): THREE.Mesh {
  const r = rng(seed);
  const n = 14;
  const pos: number[] = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rad = (diameter / 2) * (0.78 + r() * 0.4);
    pos.push(Math.cos(a) * rad, 0, Math.sin(a) * rad);
  }
  const idx: number[] = [];
  for (let i = 0; i < n; i++) idx.push(0, 1 + ((i + 1) % n), 1 + i);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color, roughness: 1, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
  m.position.y = y;
  return m;
}

const mat = (color: number, rough = 0.8, metal = 0) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });

/** One object per hazard, keyed by instanceId, positioned in world space. */
export function createHazardMeshes(chunk: Chunk, path: RoadPath): { group: THREE.Group; byInstance: Map<string, THREE.Object3D> } {
  const group = new THREE.Group();
  const byInstance = new Map<string, THREE.Object3D>();
  for (const h of chunk.hazards) {
    const type = getHazard(h.hazardId);
    const p = path.toWorld(h.s, h.lateral);
    const heading = path.pose(h.s).heading;
    const o = new THREE.Group();
    o.name = h.hazardId;
    o.position.set(p.x, 0, p.z);
    o.rotation.y = -heading;
    const seed = hashString(h.instanceId);
    if (type.kind === 'pothole') {
      const d = POTHOLE_DIAMETER_M[type.tier];
      o.add(irregularDisc(d * 1.12, seed ^ 0x55, 0.004, 0x3f3b38));
      o.add(irregularDisc(d, seed, 0.005, POTHOLE_COLOR[type.tier]));
    } else if (type.kind === 'curb') {
      const ht = CURB_HEIGHT_M[h.hazardId] ?? 0.12;
      const m = new THREE.Mesh(new THREE.BoxGeometry(CURB_WIDTH_M, ht, CURB_LENGTH_M), mat(0xa8abb0, 0.9));
      m.position.y = ht / 2;
      o.add(m);
    } else if (h.hazardId === 'gura-iadului') {
      const hole = new THREE.Mesh(new THREE.CircleGeometry(0.55, 16).rotateX(-Math.PI / 2), Object.assign(mat(0x050505, 1), { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
      hole.position.y = 0.006;
      o.add(hole);
      const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.05, 16), mat(0x6e737a, 0.5, 0.6));
      lid.position.set(0.95, 0.06, 0.2);
      lid.rotation.set(0.25, 0, 0.3);
      o.add(lid);
    } else {
      const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.03, 16), mat(0x80858c, 0.5, 0.6));
      lid.position.y = 0.015;
      o.add(lid);
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.035, 10), mat(0x5d6168, 0.6, 0.5));
      ring.position.y = 0.018;
      o.add(ring);
    }
    group.add(o);
    byInstance.set(h.instanceId, o);
  }
  return { group, byInstance };
}
