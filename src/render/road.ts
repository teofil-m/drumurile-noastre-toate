import * as THREE from 'three';
import { ROAD } from '../core/config';
import type { Chunk } from '../core/roadgen';
import type { RoadPath } from '../sim/roadPath';
import { box, mergeColored, rng, type ColoredGeometry } from './util';

const SAMPLE_M = 2;
const VERGE_M = 1;
const GROUND_HALF_M = 25;
const GROUND_Y = -0.03;

/** Triangle strip between two lateral offsets, sampled along the chunk. Faces point up. */
function strip(chunk: Chunk, path: RoadPath, latA: number, latB: number, y: number): THREE.BufferGeometry {
  const n = Math.ceil(ROAD.chunkLengthM / SAMPLE_M);
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= n; i++) {
    const s = Math.min(chunk.startS + i * SAMPLE_M, chunk.startS + ROAD.chunkLengthM);
    const a = path.toWorld(s, latA);
    const b = path.toWorld(s, latB);
    pos.push(a.x, y, a.z, b.x, y, b.z);
    if (i > 0) {
      const k = (i - 1) * 2;
      idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function flatQuad(path: RoadPath, s: number, lat: number, len: number, wid: number, y: number): THREE.BufferGeometry {
  const sa = Math.max(s - len / 2, 0);
  const sb = Math.min(s + len / 2, path.endS);
  const corners = [path.toWorld(sa, lat - wid / 2), path.toWorld(sa, lat + wid / 2), path.toWorld(sb, lat - wid / 2), path.toWorld(sb, lat + wid / 2)];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(corners.flatMap((c) => [c.x, y, c.z]), 3));
  g.setIndex([0, 2, 1, 1, 2, 3]);
  g.computeVertexNormals();
  return g;
}

function vertexColorMesh(items: ColoredGeometry[], name: string): THREE.Mesh | null {
  const geo = mergeColored(items);
  if (!geo) return null;
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true }));
  m.name = name;
  return m;
}

/** Road surface, markings, verges and cheap roadside scenery for one chunk. */
export function createRoadMeshForChunk(chunk: Chunk, path: RoadPath): THREE.Group {
  const group = new THREE.Group();
  group.name = `chunk-${chunk.index}`;
  const hw = ROAD.halfWidthM;
  const rand = rng(chunk.index * 7919 + 13);

  const road = new THREE.Mesh(strip(chunk, path, -hw, hw, 0), new THREE.MeshStandardMaterial({ color: 0x55585e, roughness: 0.95 }));
  road.name = 'road';
  group.add(road);

  const grassGeos: ColoredGeometry[] = [];
  for (const side of [-1, 1]) {
    grassGeos.push({ geometry: strip(chunk, path, side * hw, side * (hw + VERGE_M), -0.02), color: 0x7bc043 });
    grassGeos.push({ geometry: strip(chunk, path, side * (hw + VERGE_M), side * GROUND_HALF_M, GROUND_Y), color: 0x58a832 });
  }
  const grass = vertexColorMesh(grassGeos, 'grass');
  if (grass) group.add(grass);

  // Dashed centreline: 2 m dash every 4 m
  const dashes: ColoredGeometry[] = [];
  for (let d = 1; d + 1 <= ROAD.chunkLengthM; d += 4) dashes.push({ geometry: flatQuad(path, chunk.startS + d + 1, 0, 2, 0.15, 0.003), color: 0xffffff });
  const dashMesh = vertexColorMesh(dashes, 'centreline');
  if (dashMesh) group.add(dashMesh);

  // Darker asphalt patches
  const patches: ColoredGeometry[] = [];
  for (let i = 0; i < 3; i++) {
    patches.push({ geometry: flatQuad(path, chunk.startS + 3 + rand() * (ROAD.chunkLengthM - 6), (rand() - 0.5) * 5, 1 + rand() * 1.5, 1 + rand(), 0.002), color: 0x3b3d42 });
  }
  const patchMesh = vertexColorMesh(patches, 'patches');
  if (patchMesh) group.add(patchMesh);

  // Scenery: lamp posts (alternating sides) and grey blocks of flats
  const props: ColoredGeometry[] = [];
  for (let k = 0; k < 2; k++) {
    const s = chunk.startS + 12.5 + k * 25;
    const side = (chunk.index + k) % 2 === 0 ? 1 : -1;
    const p = path.toWorld(s, side * (hw + VERGE_M + 0.5));
    props.push({ geometry: box(0.15, 5.5, 0.15, p.x, 2.75, p.z), color: 0x6b7078 });
    const head = path.toWorld(s, side * (hw + VERGE_M - 0.4));
    props.push({ geometry: box(0.5, 0.2, 0.3, head.x, 5.5, head.z), color: 0xf4e9a8 });
  }
  const flatColors = [0x9ea3aa, 0xb5b0a6, 0x8d939c, 0xc4b9a8];
  for (let i = 0; i < 2; i++) {
    if (rand() < 0.4) continue;
    const side = rand() < 0.5 ? -1 : 1;
    const lat = side * (15 + rand() * 10);
    const w = 8 + rand() * 6;
    const h = 9 + rand() * 12;
    const dpt = 6 + rand() * 4;
    const p = path.toWorld(chunk.startS + 5 + i * 25 + rand() * 15, lat);
    props.push({ geometry: box(w, h, dpt, p.x, h / 2 + GROUND_Y, p.z), color: flatColors[Math.floor(rand() * flatColors.length)]! });
    props.push({ geometry: box(w + 0.05, h * 0.5, dpt + 0.05, p.x, h * 0.55, p.z), color: 0x7a8088 });
  }
  const propMesh = vertexColorMesh(props, 'props');
  if (propMesh) group.add(propMesh);

  return group;
}
