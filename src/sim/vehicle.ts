import type RAPIER from '@dimforge/rapier3d-compat';
import type { Tier } from '../core/hazards';
import type { Controls } from '../core/types';

type Rapier = typeof RAPIER;
export type V3 = [number, number, number];
export type Q4 = [number, number, number, number];

// ---------------------------------------------------------------------------
// TUNING — everything that decides how the Dacia feels lives here.
// ---------------------------------------------------------------------------
export const TUNING = {
  chassisMassKg: 900,
  chassisHalfExtents: [0.8, 0.35, 2.0] as V3, // half width / height / length (m)
  linearDamping: 0.05,
  angularDamping: 0.8, // keeps wobble from spinning forever
  // Wheels (x = left/right, z = front(-)/rear(+), chassis-local; forward is -Z)
  wheelX: 0.75,
  wheelFrontZ: -1.3,
  wheelRearZ: 1.3,
  wheelRadius: 0.35,
  // Soft, bouncy suspension: low stiffness, low damping, generous travel
  suspensionRestLength: 0.45,
  suspensionMaxTravel: 0.7,
  suspensionStiffness: 14,
  suspensionCompression: 0.9,
  suspensionRelaxation: 0.7, // < compression => underdamped => bouncy
  suspensionMaxForce: 60000,
  // Modest grip so the car slides a little
  frictionSlip: 3.2,
  sideFrictionStiffness: 0.8,
  // Drivetrain
  engineForcePerWheel: 2200, // N, applied to the 2 rear wheels (see DRIVEN_REAR_ONLY)
  brakeForcePerWheel: 40,
  handbrakeForceRear: 90,
  maxSteerRad: 0.5, // steer input (-1..1) * this
  // Hazard impulses: desired vertical velocity change (m/s) per tier; pitch/roll come from the off-centre application point
  impulseDvByTier: { small: 1.6, medium: 2.6, large: 3.8, epic: 5.2 } as Record<Tier, number>,
  hitSideDvFraction: 0.35, // sideways kick as a fraction of the vertical dv, towards the opposite side to the hit
  hitPointLateralM: 0.75, // impulse is applied this far to the hit side of the car centre
  hitPointForwardM: -1.3, // ... and at the front axle
  gaping: { downDv: 2.5, upDv: 7.5, upDelayS: 0.18 }, // gura-iadului: dive first, then launch
} as const;

const DRIVEN_REAR_ONLY = true;

// ---- small quaternion helpers (x, y, z, w) --------------------------------
export function qMul(a: Q4, b: Q4): Q4 {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}
export function qAxisAngle(x: number, y: number, z: number, angle: number): Q4 {
  const s = Math.sin(angle / 2);
  return [x * s, y * s, z * s, Math.cos(angle / 2)];
}
export function qRotate(q: Q4, v: V3): V3 {
  const [qx, qy, qz, qw] = q;
  const [vx, vy, vz] = v;
  const tx = 2 * (qy * vz - qz * vy);
  const ty = 2 * (qz * vx - qx * vz);
  const tz = 2 * (qx * vy - qy * vx);
  return [vx + qw * tx + (qy * tz - qz * ty), vy + qw * ty + (qz * tx - qx * tz), vz + qw * tz + (qx * ty - qy * tx)];
}

export interface Vehicle {
  readonly chassis: RAPIER.RigidBody;
  readonly controller: RAPIER.DynamicRayCastVehicleController;
  /** Apply drive/brake/steer for this step; call before world.step. */
  drive(controls: Controls, steer: number, dtS: number): void;
  /** Kick the chassis for a hazard hit on the given side (+1 right, -1 left). */
  kick(tier: Tier, side: 1 | -1, delayedUp?: boolean): void;
  /** Impulse due after a delay (gura-iadului's second half). Call each step. */
  tickPending(dtS: number): void;
  wheelPose(i: number): { position: V3; quaternion: Q4 };
}

export function createVehicle(R: Rapier, world: RAPIER.World, start: { x: number; y: number; z: number }): Vehicle {
  const T = TUNING;
  const body = world.createRigidBody(
    R.RigidBodyDesc.dynamic()
      .setTranslation(start.x, start.y, start.z)
      .setLinearDamping(T.linearDamping)
      .setAngularDamping(T.angularDamping)
      .setCanSleep(false),
  );
  world.createCollider(
    R.ColliderDesc.cuboid(...T.chassisHalfExtents).setMass(T.chassisMassKg).setFriction(0.3).setRestitution(0.2),
    body,
  );
  const controller = world.createVehicleController(body);
  const spots: V3[] = [
    [-T.wheelX, 0, T.wheelFrontZ],
    [T.wheelX, 0, T.wheelFrontZ],
    [-T.wheelX, 0, T.wheelRearZ],
    [T.wheelX, 0, T.wheelRearZ],
  ];
  spots.forEach(([x, y, z], i) => {
    controller.addWheel({ x, y, z }, { x: 0, y: -1, z: 0 }, { x: -1, y: 0, z: 0 }, T.suspensionRestLength, T.wheelRadius);
    controller.setWheelMaxSuspensionTravel(i, T.suspensionMaxTravel);
    controller.setWheelSuspensionStiffness(i, T.suspensionStiffness);
    controller.setWheelSuspensionCompression(i, T.suspensionCompression);
    controller.setWheelSuspensionRelaxation(i, T.suspensionRelaxation);
    controller.setWheelMaxSuspensionForce(i, T.suspensionMaxForce);
    controller.setWheelFrictionSlip(i, T.frictionSlip);
    controller.setWheelSideFrictionStiffness(i, T.sideFrictionStiffness);
  });

  let pendingUp: { dv: number; delayS: number; side: 1 | -1 } | null = null;

  const impulseAt = (dv: number, side: 1 | -1, sideDv: number): void => {
    const q = body.rotation();
    const quat: Q4 = [q.x, q.y, q.z, q.w];
    const t = body.translation();
    const local: V3 = [side * T.hitPointLateralM, 0, T.hitPointForwardM];
    const off = qRotate(quat, local);
    const sideDir = qRotate(quat, [-side, 0, 0]);
    const m = body.mass();
    body.applyImpulseAtPoint(
      { x: sideDir[0] * sideDv * m, y: dv * m, z: sideDir[2] * sideDv * m },
      { x: t.x + off[0], y: t.y + off[1], z: t.z + off[2] },
      true,
    );
  };

  return {
    chassis: body,
    controller,
    drive(controls, steer, _dtS) {
      const throttle = Math.max(0, Math.min(1, controls.throttle));
      const brake = Math.max(0, Math.min(1, controls.brake));
      const angle = -Math.max(-1, Math.min(1, steer)) * T.maxSteerRad; // Rapier: + angle turns left; engine force is negated because the car faces -Z
      for (let i = 0; i < 4; i++) {
        const rear = i >= 2;
        controller.setWheelSteering(i, rear ? 0 : angle);
        controller.setWheelEngineForce(i, !DRIVEN_REAR_ONLY || rear ? -throttle * T.engineForcePerWheel : 0);
        const handbrake = controls.handbrake && rear ? T.handbrakeForceRear : 0;
        controller.setWheelBrake(i, brake * T.brakeForcePerWheel + handbrake);
      }
    },
    kick(tier, side, delayedUp = false) {
      if (delayedUp) {
        impulseAt(-T.gaping.downDv, side, 0);
        pendingUp = { dv: T.gaping.upDv, delayS: T.gaping.upDelayS, side };
        return;
      }
      const dv = T.impulseDvByTier[tier];
      impulseAt(dv, side, dv * T.hitSideDvFraction);
    },
    tickPending(dtS) {
      if (!pendingUp) return;
      pendingUp.delayS -= dtS;
      if (pendingUp.delayS <= 0) {
        impulseAt(pendingUp.dv, pendingUp.side, 0);
        pendingUp = null;
      }
    },
    wheelPose(i) {
      const r = body.rotation();
      const quat: Q4 = [r.x, r.y, r.z, r.w];
      const t = body.translation();
      const spot = spots[i]!;
      const len = controller.wheelSuspensionLength(i) ?? T.suspensionRestLength;
      const off = qRotate(quat, [spot[0], spot[1] - len, spot[2]]);
      const steerAngle = controller.wheelSteering(i) ?? 0;
      const spin = controller.wheelRotation(i) ?? 0;
      const q = qMul(qMul(quat, qAxisAngle(0, 1, 0, steerAngle)), qAxisAngle(1, 0, 0, spin));
      return { position: [t.x + off[0], t.y + off[1], t.z + off[2]], quaternion: q };
    },
  };
}
