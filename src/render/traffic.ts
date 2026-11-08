import * as THREE from 'three';
import type { SimSnapshot } from '../sim/sim';
import { hashString } from './util';

const PALETTE = [0xe74c3c, 0x3498db, 0x2ecc71, 0xe67e22, 0x9b59b6, 0xecf0f1, 0x1abc9c, 0xff6fa5, 0x34495e];

export function trafficColor(instanceId: string): number {
  return PALETTE[hashString(instanceId) % PALETTE.length]!;
}

export interface TrafficLayer {
  update(traffic: SimSnapshot['traffic']): void;
  dispose(): void;
}

export function createTrafficLayer(parent: THREE.Object3D): TrafficLayer {
  const bodyGeo = new THREE.BoxGeometry(1.7, 0.6, 4.0);
  const cabinGeo = new THREE.BoxGeometry(1.5, 0.5, 2.0);
  const glassGeo = new THREE.BoxGeometry(1.54, 0.3, 1.7);
  const wheelGeo = new THREE.CylinderGeometry(0.33, 0.33, 0.25, 10).rotateZ(Math.PI / 2);
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x20262e, roughness: 0.2 });
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x151515 });
  const bodyMats = new Map<number, THREE.MeshStandardMaterial>();
  const cars = new Map<string, THREE.Group>();

  const build = (id: string): THREE.Group => {
    const color = trafficColor(id);
    let m = bodyMats.get(color);
    if (!m) {
      m = new THREE.MeshStandardMaterial({ color, roughness: 0.6, flatShading: true });
      bodyMats.set(color, m);
    }
    const g = new THREE.Group();
    const add = (geo: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number): void => {
      const mesh = new THREE.Mesh(geo, material);
      mesh.position.set(x, y, z);
      g.add(mesh);
    };
    add(bodyGeo, m, 0, 0, 0);
    add(cabinGeo, m, 0, 0.5, 0.2);
    add(glassGeo, glassMat, 0, 0.52, 0.2);
    for (const sx of [-0.8, 0.8]) for (const sz of [-1.3, 1.3]) add(wheelGeo, wheelMat, sx, -0.3, sz);
    return g;
  };

  return {
    update(traffic) {
      const seen = new Set<string>();
      for (const t of traffic) {
        seen.add(t.instanceId);
        let car = cars.get(t.instanceId);
        if (!car) {
          car = build(t.instanceId);
          cars.set(t.instanceId, car);
          parent.add(car);
        }
        car.position.set(t.position[0], t.position[1], t.position[2]);
        car.rotation.y = -t.heading;
      }
      for (const [id, car] of cars) {
        if (!seen.has(id)) {
          parent.remove(car);
          cars.delete(id);
        }
      }
    },
    dispose() {
      for (const car of cars.values()) parent.remove(car);
      cars.clear();
      for (const g of [bodyGeo, cabinGeo, glassGeo, wheelGeo]) g.dispose();
      glassMat.dispose();
      wheelMat.dispose();
      for (const m of bodyMats.values()) m.dispose();
    },
  };
}
