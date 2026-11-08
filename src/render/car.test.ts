import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { Part } from '../core/damage';
import { createDacia } from './car';

const PARTS: Part[] = ['bumper', 'hood', 'doorLeft', 'doorRight', 'exhaust', 'transmission'];

function triangles(root: THREE.Object3D): number {
  let total = 0;
  root.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      const g = o.geometry as THREE.BufferGeometry;
      total += (g.index ? g.index.count : g.getAttribute('position').count) / 3;
    }
  });
  return total;
}

describe('createDacia', () => {
  const dacia = createDacia();

  it('has the six named parts, both in parts and as descendants of root', () => {
    expect(Object.keys(dacia.parts).sort()).toEqual([...PARTS].sort());
    for (const p of PARTS) {
      expect(dacia.parts[p].name).toBe(p);
      expect(dacia.root.getObjectByName(p)).toBe(dacia.parts[p]);
    }
  });

  it('has four wheels under root', () => {
    expect(dacia.wheels).toHaveLength(4);
    for (const w of dacia.wheels) expect(dacia.root.getObjectById(w.id)).toBe(w);
  });

  it('is galben Dacia yellow', () => {
    const hsl = { h: 0, s: 0, l: 0 };
    dacia.bodyMaterial.color.getHSL(hsl, THREE.SRGBColorSpace);
    expect(hsl.h * 360).toBeGreaterThan(40);
    expect(hsl.h * 360).toBeLessThan(60);
    expect(hsl.s).toBeGreaterThan(0.6);
  });

  it('is low poly', () => {
    expect(triangles(dacia.root)).toBeLessThan(5000);
  });
});
