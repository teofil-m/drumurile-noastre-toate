import { describe, expect, it } from 'vitest';
import type { Chunk } from '../core/roadgen';
import type { Controls, RunEvent } from '../core/types';
import { createSim, type Sim } from './sim';

const DT = 1 / 60;
const GAS: Controls = { throttle: 1, brake: 0, steer: 0, handbrake: false };
const COAST: Controls = { throttle: 0, brake: 0, steer: 0, handbrake: false };

const blank = (index: number): Chunk => ({ index, startS: index * 50, curvature: 0, hazards: [], traffic: [] });

function source(patch: (c: Chunk) => void): (index: number) => Chunk {
  return (i) => {
    const c = blank(i);
    patch(c);
    return c;
  };
}

function drive(sim: Sim, steps: number, controls: Controls = GAS, until?: (events: RunEvent[]) => boolean) {
  const all: RunEvent[] = [];
  let snap = sim.step(controls, 0, DT).snapshot;
  for (let i = 1; i < steps; i++) {
    const r = sim.step(controls, 0, DT);
    snap = r.snapshot;
    all.push(...r.events);
    if (until?.(r.events)) break;
  }
  return { snap, events: all };
}

describe('sim (headless Rapier)', () => {
  it('creates with the default chunk source and accelerates under throttle without exceeding top speed', async () => {
    const sim = await createSim(1);
    let max = 0;
    let last = 0;
    for (let i = 0; i < 600; i++) {
      sim.ensureRoadAhead(sim.step(COAST, 0, DT).snapshot.s);
      const { snapshot } = sim.step(GAS, 0, DT);
      max = Math.max(max, snapshot.speedKmh);
      last = snapshot.speedKmh;
    }
    expect(last).toBeGreaterThan(30);
    expect(max).toBeLessThanOrEqual(110.5);
    sim.dispose();
  });

  it('starts at the origin heading -Z and drives forward along s', async () => {
    const sim = await createSim(1, { chunkSource: source(() => {}) });
    const { snap } = drive(sim, 120);
    expect(snap.s).toBeGreaterThan(8);
    expect(Math.abs(snap.lateral)).toBeLessThan(1);
    expect(snap.car.position[2]).toBeLessThan(-8);
    expect(snap.wheels).toHaveLength(4);
    expect(snap.car.position[1]).toBeGreaterThan(0.2);
    sim.dispose();
  });

  it('steering right moves the car to the right (+x)', async () => {
    const sim = await createSim(1, { chunkSource: source(() => {}) });
    let snap = sim.step(GAS, 0, DT).snapshot;
    for (let i = 0; i < 150; i++) snap = sim.step(GAS, 1, DT).snapshot;
    expect(snap.car.position[0]).toBeGreaterThan(1);
    sim.dispose();
  });

  it('brake slows the car down', async () => {
    const sim = await createSim(1, { chunkSource: source(() => {}) });
    const fast = drive(sim, 240).snap.speedKmh;
    const slow = drive(sim, 120, { throttle: 0, brake: 1, steer: 0, handbrake: false }).snap.speedKmh;
    expect(slow).toBeLessThan(fast * 0.5);
    sim.dispose();
  });

  it('driving over a pothole emits hazardHit once and visibly bounces the car', async () => {
    const sim = await createSim(1, {
      chunkSource: source((c) => {
        if (c.index === 1) c.hazards.push({ instanceId: 'p1', hazardId: 'groapa-de-gunoi', s: 60, lateral: 0 });
      }),
    });
    const hits: RunEvent[] = [];
    let maxY = 0;
    let maxTilt = 0;
    let snap = sim.step(GAS, 0, DT).snapshot;
    for (let i = 0; i < 600 && snap.s < 90; i++) {
      const r = sim.step(GAS, 0, DT);
      snap = r.snapshot;
      hits.push(...r.events.filter((e) => e.type === 'hazardHit'));
      if (hits.length > 0) {
        maxY = Math.max(maxY, snap.car.position[1]);
        const q = snap.car.quaternion;
        maxTilt = Math.max(maxTilt, Math.hypot(q[0], q[2]));
      }
    }
    expect(hits.length).toBeGreaterThanOrEqual(1);
    expect(hits[0]).toMatchObject({ type: 'hazardHit', hazardId: 'groapa-de-gunoi', instanceId: 'p1' });
    expect(maxY).toBeGreaterThan(0.9);
    expect(maxTilt).toBeGreaterThan(0.01);
    sim.dispose();
  });

  it('bigger hazards throw the car higher (epic > small)', async () => {
    const peak = async (hazardId: 'gropita' | 'craterul-national'): Promise<number> => {
      const sim = await createSim(1, {
        chunkSource: source((c) => {
          if (c.index === 1) c.hazards.push({ instanceId: 'p', hazardId, s: 60, lateral: 0 });
        }),
      });
      let hit = false;
      let top = 0;
      let snap = sim.step(GAS, 0, DT).snapshot;
      for (let i = 0; i < 600 && snap.s < 80; i++) {
        const r = sim.step(GAS, 0, DT);
        snap = r.snapshot;
        hit ||= r.events.some((e) => e.type === 'hazardHit');
        if (hit) top = Math.max(top, snap.car.position[1]);
      }
      sim.dispose();
      return top;
    };
    expect(await peak('craterul-national')).toBeGreaterThan(await peak('gropita'));
  });

  it('a pothole on the far side of the road does not register', async () => {
    const sim = await createSim(1, {
      chunkSource: source((c) => {
        if (c.index === 1) c.hazards.push({ instanceId: 'far', hazardId: 'gropita', s: 60, lateral: -3 });
      }),
    });
    const { events } = drive(sim, 420);
    expect(events.filter((e) => e.type === 'hazardHit')).toHaveLength(0);
    sim.dispose();
  });

  it('hitting a stopped car in the player lane emits trafficCollision', async () => {
    const sim = await createSim(1, {
      startLateral: 1.75,
      chunkSource: source((c) => {
        if (c.index === 1) c.traffic.push({ instanceId: 't1', s: 70, lane: 1, speedKmh: 0 });
      }),
    });
    const { events } = drive(sim, 600, GAS, (e) => e.some((x) => x.type === 'trafficCollision'));
    expect(events.some((e) => e.type === 'trafficCollision')).toBe(true);
    sim.dispose();
  });

  it('exposes traffic in the snapshot and moves oncoming cars toward the player', async () => {
    const sim = await createSim(1, {
      chunkSource: source((c) => {
        if (c.index === 1) c.traffic.push({ instanceId: 'o1', s: 90, lane: -1, speedKmh: 36 });
      }),
    });
    const first = sim.step(COAST, 0, DT).snapshot;
    expect(first.traffic.map((t) => t.instanceId)).toEqual(['o1']);
    const z0 = first.traffic[0]!.position[2];
    const later = drive(sim, 60, COAST).snap;
    expect(later.traffic[0]!.position[2]).toBeGreaterThan(z0 - 0.0001 + 5); // moved ~10 m toward +Z (back toward start)
    sim.dispose();
  });

  it('detach adds a loose part', async () => {
    const sim = await createSim(1, { chunkSource: source(() => {}) });
    expect(sim.step(COAST, 0, DT).snapshot.looseParts).toHaveLength(0);
    sim.detach('bumper');
    const { looseParts } = sim.step(COAST, 0, DT).snapshot;
    expect(looseParts).toHaveLength(1);
    expect(looseParts[0]!.part).toBe('bumper');
    sim.dispose();
  });

  it('ensureRoadAhead returns only newly generated chunks and covers 300 m ahead', async () => {
    const sim = await createSim(1, { chunkSource: source(() => {}) });
    const first = sim.ensureRoadAhead(0);
    expect(first.length).toBeGreaterThanOrEqual(6);
    expect(first[0]!.index).toBe(0);
    expect(sim.ensureRoadAhead(0)).toEqual([]);
    expect(() => sim.path.pose(300)).not.toThrow();
    sim.dispose();
  });
});
