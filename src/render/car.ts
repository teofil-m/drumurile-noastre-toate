import * as THREE from 'three';
import type { Part } from '../core/damage';

export interface Dacia {
  root: THREE.Group;
  parts: Record<Part, THREE.Object3D>;
  wheels: THREE.Object3D[];
  bodyMaterial: THREE.MeshStandardMaterial;
}

export const DACIA_YELLOW = 0xf2c230;

// Local frame matches the physics chassis: forward -Z, +X right, +Y up, origin at chassis centre.
const WHEEL_X = 0.75;
const WHEEL_Z = 1.3;
const WHEEL_R = 0.35;

export function createDacia(): Dacia {
  const root = new THREE.Group();
  root.name = 'dacia';
  const mat = (color: number, rough = 0.7, metal = 0) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, flatShading: true });
  const body = mat(DACIA_YELLOW, 0.55);
  const glass = mat(0x1b2530, 0.2, 0.3);
  const chrome = mat(0xb8bdc4, 0.3, 0.6);
  const rubber = mat(0x151515, 0.95);
  const hub = mat(0x9aa0a6, 0.4, 0.4);
  const lamp = new THREE.MeshStandardMaterial({ color: 0xfff6d0, emissive: 0xffe9a0, emissiveIntensity: 0.6 });
  const tail = new THREE.MeshStandardMaterial({ color: 0xd02020, emissive: 0x801010, emissiveIntensity: 0.4 });
  const amber = mat(0xff9a1a);
  const rust = mat(0x8a4a22, 0.95);
  const dark = mat(0x303338, 0.8);

  const add = (parent: THREE.Object3D, geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number): THREE.Mesh => {
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  };
  const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);

  // Three-box silhouette: long hood, cabin, trunk.
  add(root, box(1.6, 0.5, 3.8), body, 0, 0.05, 0);
  add(root, box(1.4, 0.5, 1.5), body, 0, 0.55, 0.15); // cabin
  add(root, box(1.44, 0.3, 1.2), glass, 0, 0.58, 0.15); // tinted windows (wider, shorter => yellow pillars)
  add(root, box(1.5, 0.12, 0.95), body, 0, 0.36, 1.4); // trunk lid
  add(root, box(1.5, 0.06, 1.5), body, 0, 0.82, 0.15); // roof cap

  // Parts that can fall off. Each is centred on its own origin.
  const hood = add(root, box(1.5, 0.12, 1.2), body, 0, 0.36, -1.3);
  hood.name = 'hood';
  const bumper = new THREE.Group();
  bumper.name = 'bumper';
  bumper.position.set(0, -0.08, -2.0);
  add(bumper, box(1.75, 0.16, 0.16), chrome, 0, 0, 0);
  add(bumper, box(0.2, 0.12, 0.1), chrome, -0.6, 0.12, 0);
  root.add(bumper);
  const doorL = new THREE.Group();
  doorL.name = 'doorLeft';
  doorL.position.set(-0.81, 0.08, 0.1);
  add(doorL, box(0.05, 0.42, 1.0), body, 0, 0, 0);
  add(doorL, box(0.07, 0.04, 0.2), chrome, 0, 0.1, 0.3);
  root.add(doorL);
  const doorR = doorL.clone();
  doorR.name = 'doorRight';
  doorR.position.x = 0.81;
  root.add(doorR);
  const exhaust = add(root, new THREE.CylinderGeometry(0.05, 0.05, 0.6, 8).rotateX(Math.PI / 2), dark, 0.5, -0.22, 1.95);
  exhaust.name = 'exhaust';
  const transmission = add(root, box(0.4, 0.2, 0.7), dark, 0, -0.22, -0.2);
  transmission.name = 'transmission';

  // Big round headlights + indicators + tail lights
  const lampGeo = new THREE.CylinderGeometry(0.17, 0.17, 0.1, 14).rotateX(Math.PI / 2);
  add(root, lampGeo, lamp, -0.5, 0.2, -1.93);
  add(root, lampGeo, lamp, 0.5, 0.2, -1.93);
  const indGeo = new THREE.CylinderGeometry(0.07, 0.07, 0.08, 8).rotateX(Math.PI / 2);
  add(root, indGeo, amber, -0.2, 0.2, -1.93);
  add(root, indGeo, amber, 0.2, 0.2, -1.93);
  add(root, box(0.3, 0.14, 0.06), tail, -0.6, 0.2, 1.91);
  add(root, box(0.3, 0.14, 0.06), tail, 0.6, 0.2, 1.91);
  add(root, box(0.5, 0.2, 0.04), chrome, 0, 0.12, -1.91); // grille

  // Crooked rear bumper + rust patch for humour
  const rear = add(root, box(1.75, 0.16, 0.16), chrome, 0.05, -0.08, 2.0);
  rear.rotation.z = 0.09;
  add(root, box(0.04, 0.22, 0.5), rust, -0.81, 0.15, 1.2);
  add(root, box(0.5, 0.02, 0.3), rust, 0.4, 0.43, 1.5);

  // Wheels
  const wheels: THREE.Object3D[] = [];
  const tyreGeo = new THREE.CylinderGeometry(WHEEL_R, WHEEL_R, 0.26, 16).rotateZ(Math.PI / 2);
  const hubGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.28, 10).rotateZ(Math.PI / 2);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    const w = new THREE.Group();
    w.name = 'wheel';
    w.position.set(sx * WHEEL_X, -0.2, sz * WHEEL_Z);
    add(w, tyreGeo, rubber, 0, 0, 0);
    add(w, hubGeo, hub, 0, 0, 0);
    add(w, box(0.3, 0.08, 0.08), dark, 0, 0, 0); // spoke mark so rotation is visible
    root.add(w);
    wheels.push(w);
  }

  const parts: Record<Part, THREE.Object3D> = { bumper, hood, doorLeft: doorL, doorRight: doorR, exhaust, transmission };
  return { root, parts, wheels, bodyMaterial: body };
}
