import RAPIER from '@dimforge/rapier3d-compat';
import { ROAD, TOP_SPEED_KMH } from '../core/config';
import type { Part } from '../core/damage';
import { getHazard } from '../core/hazards';
import { generateChunk, type Chunk } from '../core/roadgen';
import type { Controls, RunEvent } from '../core/types';
import { hazardContacts, trafficCollision } from './contacts';
import { RoadPath } from './roadPath';
import { createVehicle, qAxisAngle, qRotate, type Q4, type V3 } from './vehicle';

export interface SimSnapshot {
  s: number;
  lateral: number;
  speedKmh: number;
  car: { position: V3; quaternion: Q4 };
  wheels: { position: V3; quaternion: Q4 }[];
  traffic: { instanceId: string; position: V3; heading: number }[];
  looseParts: { part: Part; position: V3; quaternion: Q4 }[];
}

export interface Sim {
  step(controls: Controls, steer: number, dtS: number): { snapshot: SimSnapshot; events: RunEvent[] };
  detach(part: Part): void;
  ensureRoadAhead(tS: number): Chunk[];
  readonly path: RoadPath;
  /** Test-only seam: teleport the chassis (zero velocity). */
  debugSetCarPose(position: V3, quaternion: Q4): void;
  dispose(): void;
}

export interface SimOptions {
  chunkSource?: (index: number, tS: number) => Chunk;
  /** Starting lateral offset from the centreline (default 0). */
  startLateral?: number;
}

const START_S_M = 4; // rear wheels must have road under them at spawn
const LOOKAHEAD_M = 300;
const KEEP_BEHIND_M = 100;
const SEGMENT_M = 5;
const VERGE_M = 1;
const LANE_OFFSET_M = 1.75;
const CURB_HEIGHT_M: Record<string, number> = { 'bordura-protocol': 0.12, 'bordura-everest': 0.3 };
const CURB_LENGTH_M = 2;
const MAX_SPEED_MS = TOP_SPEED_KMH / 3.6;
const PART_SIZE_M = 0.3;
const GROUND_HALF_WIDTH_M = 25;
const VOID_Y_M = -3;
const FLIP_UP_Y = 0.3;
const FLIP_RESET_AFTER_S = 1.5;
const RESET_HEIGHT_M = 1;
const ROLL_ARM_UP_Y = 0.5; // upY above this re-arms roll detection
const ROLL_TRIGGER_UP_Y = -0.5; // upY below this while armed counts one roll
const ROLL_BOOST_MIN_KMH = 80;

interface LoadedChunk { chunk: Chunk; colliders: RAPIER.Collider[] }
interface TrafficCar { instanceId: string; s: number; lane: 1 | -1; speedMs: number; body: RAPIER.RigidBody }
interface LoosePart { part: Part; body: RAPIER.RigidBody }

const yaw = (heading: number): Q4 => qAxisAngle(0, 1, 0, -heading);
const quatOf = (q: Q4): { x: number; y: number; z: number; w: number } => ({ x: q[0], y: q[1], z: q[2], w: q[3] });

export async function createSim(seed: number, opts: SimOptions = {}): Promise<Sim> {
  await RAPIER.init();
  const chunkSource = opts.chunkSource ?? ((i: number, t: number) => generateChunk(seed, i, t));
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  const path = new RoadPath();
  const loaded = new Map<number, LoadedChunk>();
  const traffic: TrafficCar[] = [];
  const loose: LoosePart[] = [];
  const impulsed = new Set<string>();
  let lastTS = 0;
  let nextChunk = 0;

  const startLateral = opts.startLateral ?? 0;
  const vehicle = createVehicle(RAPIER, world, { x: startLateral, y: 1, z: -START_S_M });
  let s = START_S_M;
  let lateral = startLateral;
  let flippedForS = 0;
  let rollArmed = true;

  const addFixed = (cx: number, cy: number, cz: number, hx: number, hy: number, hz: number, heading: number): RAPIER.Collider => {
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(cx, cy, cz).setRotation(quatOf(yaw(heading))));
    return world.createCollider(RAPIER.ColliderDesc.cuboid(hx, hy, hz).setFriction(1), body);
  };

  const trafficHeading = (car: TrafficCar, sc: number): number => path.pose(sc).heading + (car.lane === 1 ? 0 : Math.PI);

  const placeTraffic = (car: TrafficCar): void => {
    const sc = Math.min(Math.max(car.s, 0), path.endS);
    const w = path.toWorld(sc, car.lane * LANE_OFFSET_M);
    car.body.setNextKinematicTranslation({ x: w.x, y: 0.5, z: w.z });
    car.body.setNextKinematicRotation(quatOf(yaw(trafficHeading(car, sc))));
  };

  const spawnTraffic = (spawn: Chunk['traffic'][number]): void => {
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased());
    world.createCollider(RAPIER.ColliderDesc.cuboid(0.8, 0.5, 2.0), body);
    const car: TrafficCar = { instanceId: spawn.instanceId, s: spawn.s, lane: spawn.lane, speedMs: spawn.speedKmh / 3.6, body };
    const sc = Math.min(Math.max(car.s, 0), path.endS);
    const w = path.toWorld(sc, car.lane * LANE_OFFSET_M);
    body.setTranslation({ x: w.x, y: 0.5, z: w.z }, true);
    body.setRotation(quatOf(yaw(trafficHeading(car, sc))), true);
    traffic.push(car);
  };

  const registerChunk = (chunk: Chunk): void => {
    const colliders: RAPIER.Collider[] = [];
    const half = ROAD.halfWidthM + VERGE_M;
    for (let a = chunk.startS; a < chunk.startS + ROAD.chunkLengthM - 1e-9; a += SEGMENT_M) {
      const p = path.pose(a + SEGMENT_M / 2);
      colliders.push(addFixed(p.x, -0.1, p.z, half, 0.1, SEGMENT_M / 2 + 0.05, p.heading));
      // grass: slightly below the road so leaving the tarmac is a bump, not a fall
      colliders.push(addFixed(p.x, -0.13, p.z, GROUND_HALF_WIDTH_M, 0.1, SEGMENT_M / 2 + 0.05, p.heading));
    }
    for (const h of chunk.hazards) {
      const height = CURB_HEIGHT_M[h.hazardId];
      if (getHazard(h.hazardId).kind !== 'curb' || height === undefined) continue;
      const w = path.toWorld(h.s, h.lateral);
      colliders.push(addFixed(w.x, height / 2, w.z, 0.15, height / 2, CURB_LENGTH_M / 2, path.pose(h.s).heading));
    }
    loaded.set(chunk.index, { chunk, colliders });
    chunk.traffic.forEach(spawnTraffic);
  };

  const dropBehind = (): void => {
    for (const [index, lc] of loaded) {
      if (lc.chunk.startS + ROAD.chunkLengthM < s - KEEP_BEHIND_M) {
        for (const c of lc.colliders) world.removeCollider(c, false);
        loaded.delete(index);
      }
    }
    for (let i = traffic.length - 1; i >= 0; i--) {
      const car = traffic[i]!;
      if (car.s < s - KEEP_BEHIND_M) {
        world.removeRigidBody(car.body);
        traffic.splice(i, 1);
      }
    }
  };

  const ensureRoadAhead = (tS: number): Chunk[] => {
    lastTS = tS;
    const added: Chunk[] = [];
    const target = Math.floor((s + LOOKAHEAD_M) / ROAD.chunkLengthM);
    while (nextChunk <= target) {
      const chunk = chunkSource(nextChunk, tS);
      path.addChunk(chunk);
      registerChunk(chunk);
      added.push(chunk);
      nextChunk++;
    }
    dropBehind();
    return added;
  };



  const snapshot = (speedKmh: number): SimSnapshot => {
    const t = vehicle.chassis.translation();
    const r = vehicle.chassis.rotation();
    return {
      s,
      lateral,
      speedKmh,
      car: { position: [t.x, t.y, t.z], quaternion: [r.x, r.y, r.z, r.w] },
      wheels: [0, 1, 2, 3].map((i) => vehicle.wheelPose(i)),
      traffic: traffic.map((c) => {
        const p = c.body.translation();
        return { instanceId: c.instanceId, position: [p.x, p.y, p.z], heading: trafficHeading(c, Math.min(Math.max(c.s, 0), path.endS)) };
      }),
      looseParts: loose.map((l) => {
        const p = l.body.translation();
        const q = l.body.rotation();
        return { part: l.part, position: [p.x, p.y, p.z], quaternion: [q.x, q.y, q.z, q.w] };
      }),
    };
  };

  return {
    path,
    ensureRoadAhead,
    detach(part) {
      const t = vehicle.chassis.translation();
      const v = vehicle.chassis.linvel();
      const body = world.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic().setTranslation(t.x, t.y + 0.6, t.z).setLinvel(v.x, v.y + 2.5, v.z).setAngvel({ x: 2, y: 3, z: 1 }),
      );
      world.createCollider(RAPIER.ColliderDesc.cuboid(PART_SIZE_M, PART_SIZE_M / 2, PART_SIZE_M).setMass(20).setRestitution(0.4), body);
      loose.push({ part, body });
    },
    step(controls, steer, dtS) {
      if (path.endS < s + LOOKAHEAD_M / 2) ensureRoadAhead(lastTS);
      for (const car of traffic) {
        car.s += (car.lane === 1 ? 1 : -1) * car.speedMs * dtS;
        placeTraffic(car);
      }
      vehicle.drive(controls, steer, dtS);
      vehicle.tickPending(dtS);
      world.timestep = dtS;
      vehicle.controller.updateVehicle(dtS);
      world.step();

      const v = vehicle.chassis.linvel();
      const speed = Math.hypot(v.x, v.z); // horizontal only
      if (speed > MAX_SPEED_MS) {
        const k = MAX_SPEED_MS / speed;
        vehicle.chassis.setLinvel({ x: v.x * k, y: v.y, z: v.z * k }, true);
      }
      const speedKmh = Math.min(speed, MAX_SPEED_MS) * 3.6;

      const prevS = s;
      const t = vehicle.chassis.translation();
      const proj = path.project(t.x, t.z, s);
      s = proj.s;
      lateral = proj.lateral;

      // recovery: fell into the void, or stuck upside down / on its side
      const rot = vehicle.chassis.rotation();
      const upY = qRotate([rot.x, rot.y, rot.z, rot.w], [0, 1, 0])[1];
      const events: RunEvent[] = [];
      if (rollArmed && upY < ROLL_TRIGGER_UP_Y) {
        rollArmed = false;
        events.push({ type: 'roll', speedKmh });
      } else if (!rollArmed && upY > ROLL_ARM_UP_Y) rollArmed = true;
      flippedForS = upY < FLIP_UP_Y ? flippedForS + dtS : 0;
      if (t.y < VOID_Y_M || flippedForS > FLIP_RESET_AFTER_S) {
        const w = path.toWorld(s, 0);
        vehicle.chassis.setTranslation({ x: w.x, y: RESET_HEIGHT_M, z: w.z }, true);
        vehicle.chassis.setRotation(quatOf(yaw(path.pose(s).heading)), true);
        vehicle.chassis.setLinvel({ x: 0, y: 0, z: 0 }, true);
        vehicle.chassis.setAngvel({ x: 0, y: 0, z: 0 }, true);
        lateral = 0;
        flippedForS = 0;
      }

      const hazards = [...loaded.values()].flatMap((l) => l.chunk.hazards);
      for (const h of hazardContacts(prevS, s, lateral, hazards)) {
        if (impulsed.has(h.instanceId)) continue;
        impulsed.add(h.instanceId);
        const tier = getHazard(h.hazardId).tier;
        const rollBoost = (tier === 'large' || tier === 'epic') && speedKmh >= ROLL_BOOST_MIN_KMH;
        vehicle.kick(tier, h.lateral >= lateral ? 1 : -1, h.hazardId === 'gura-iadului', rollBoost);
        events.push({ type: 'hazardHit', hazardId: h.hazardId, instanceId: h.instanceId, speedKmh });
      }
      if (trafficCollision(s, lateral, traffic, LANE_OFFSET_M)) events.push({ type: 'trafficCollision' });
      return { snapshot: snapshot(speedKmh), events };
    },
    debugSetCarPose(position, quaternion) {
      vehicle.chassis.setTranslation({ x: position[0], y: position[1], z: position[2] }, true);
      vehicle.chassis.setRotation(quatOf(quaternion), true);
      vehicle.chassis.setLinvel({ x: 0, y: 0, z: 0 }, true);
      vehicle.chassis.setAngvel({ x: 0, y: 0, z: 0 }, true);
    },
    dispose() {
      world.free();
    },
  };
}
