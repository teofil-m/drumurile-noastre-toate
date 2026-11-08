import * as THREE from 'three';
import { ROAD } from '../core/config';
import type { Part } from '../core/damage';
import type { Chunk } from '../core/roadgen';
import type { RoadPath } from '../sim/roadPath';
import type { SimSnapshot } from '../sim/sim';
import { ChaseCamera } from './camera';
import { createDacia } from './car';
import { createHazardMeshes } from './hazards';
import { createRoadMeshForChunk } from './road';
import { createTrafficLayer } from './traffic';
import { disposeObject } from './util';

export interface Renderer {
  addChunks(chunks: readonly Chunk[], path: RoadPath): void;
  removeChunksBefore(s: number): void;
  update(snapshot: SimSnapshot, dtS: number): void;
  detach(part: Part): void;
  hideHazard(instanceId: string): void;
  resize(w: number, h: number): void;
  render(): void;
  dispose(): void;
}

const SKY = 0x8fd3f4;
const LOOSE_PART_MAX_M = 0.6;

interface ChunkEntry { endS: number; group: THREE.Group; hazards: Map<string, THREE.Object3D> }

export function createRenderer(canvas: HTMLCanvasElement): Renderer {
  const gl = new THREE.WebGLRenderer({ canvas, antialias: true });
  gl.setPixelRatio(Math.min(typeof devicePixelRatio === 'number' ? devicePixelRatio : 1, 2));
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SKY);
  scene.fog = new THREE.Fog(SKY, 70, 280);
  scene.add(new THREE.HemisphereLight(0xcfeaff, 0x6a8a4a, 1.6));
  const sun = new THREE.DirectionalLight(0xfff2d0, 2.0);
  sun.position.set(30, 60, 20);
  scene.add(sun);

  const chase = new ChaseCamera(canvas.width > 0 && canvas.height > 0 ? canvas.width / canvas.height : 16 / 9);
  const dacia = createDacia();
  scene.add(dacia.root);
  const traffic = createTrafficLayer(scene);
  const chunks = new Map<number, ChunkEntry>();
  const loose = new Map<Part, THREE.Object3D>();

  const carQ = new THREE.Quaternion();
  const invQ = new THREE.Quaternion();
  const tmpQ = new THREE.Quaternion();
  const tmpV = new THREE.Vector3();
  const carP = new THREE.Vector3();

  return {
    addChunks(list, path) {
      for (const chunk of list) {
        if (chunks.has(chunk.index)) continue;
        const group = createRoadMeshForChunk(chunk, path);
        const { group: hz, byInstance } = createHazardMeshes(chunk, path);
        group.add(hz);
        scene.add(group);
        chunks.set(chunk.index, { endS: chunk.startS + ROAD.chunkLengthM, group, hazards: byInstance });
      }
    },
    removeChunksBefore(s) {
      for (const [i, c] of chunks) {
        if (c.endS < s) {
          scene.remove(c.group);
          disposeObject(c.group);
          chunks.delete(i);
        }
      }
    },
    update(snap, dtS) {
      carP.set(...snap.car.position);
      carQ.set(...snap.car.quaternion);
      dacia.root.position.copy(carP);
      dacia.root.quaternion.copy(carQ);
      invQ.copy(carQ).invert();
      snap.wheels.forEach((w, i) => {
        const obj = dacia.wheels[i];
        if (!obj) return;
        tmpV.set(...w.position).sub(carP).applyQuaternion(invQ);
        obj.position.copy(tmpV);
        obj.quaternion.copy(invQ).multiply(tmpQ.set(...w.quaternion));
      });
      traffic.update(snap.traffic);

      const present = new Set<Part>();
      for (const lp of snap.looseParts) {
        present.add(lp.part);
        let o = loose.get(lp.part);
        if (!o) {
          o = dacia.parts[lp.part].clone();
          o.visible = true;
          o.position.set(0, 0, 0);
          o.quaternion.identity();
          const size = new THREE.Box3().setFromObject(o).getSize(new THREE.Vector3());
          o.scale.setScalar(Math.min(1, LOOSE_PART_MAX_M / Math.max(size.x, size.y, size.z, 1e-3)));
          loose.set(lp.part, o);
          scene.add(o);
        }
        o.position.set(...lp.position);
        o.quaternion.set(...lp.quaternion);
      }
      for (const [part, o] of loose) {
        if (!present.has(part)) {
          scene.remove(o);
          loose.delete(part);
        }
      }

      chase.update(snap.car.position, snap.car.quaternion, snap.speedKmh, dtS);
    },
    detach(part) {
      dacia.parts[part].visible = false;
    },
    hideHazard(instanceId) {
      for (const c of chunks.values()) {
        const o = c.hazards.get(instanceId);
        if (o) o.visible = false;
      }
    },
    resize(w, h) {
      gl.setSize(w, h, false);
      chase.camera.aspect = w / Math.max(h, 1);
      chase.camera.updateProjectionMatrix();
    },
    render() {
      gl.render(scene, chase.camera);
    },
    dispose() {
      for (const c of chunks.values()) disposeObject(c.group);
      chunks.clear();
      traffic.dispose();
      disposeObject(dacia.root);
      gl.dispose();
      gl.forceContextLoss();
    },
  };
}
