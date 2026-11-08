import * as THREE from 'three';
import { TOP_SPEED_KMH } from '../core/config';
import type { Q4, V3 } from '../sim/vehicle';

const BACK_M = 6;
const UP_M = 2.5;
const LOOK_AHEAD_M = 8;
const POS_RATE = 5;
const FOV_MIN = 60;
const FOV_MAX = 70;

export class ChaseCamera {
  readonly camera: THREE.PerspectiveCamera;
  private yaw = 0;
  private initialised = false;
  private readonly fwd = new THREE.Vector3();
  private readonly q = new THREE.Quaternion();
  private readonly target = new THREE.Vector3();
  private readonly look = new THREE.Vector3();

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(FOV_MIN, aspect, 0.1, 400);
  }

  update(position: V3, quaternion: Q4, speedKmh: number, dtS: number): void {
    this.q.set(quaternion[0], quaternion[1], quaternion[2], quaternion[3]);
    this.fwd.set(0, 0, -1).applyQuaternion(this.q);
    // Follow heading on the ground plane only, so flips/tumbles don't spin the camera.
    if (Math.hypot(this.fwd.x, this.fwd.z) > 0.2) this.yaw = Math.atan2(this.fwd.x, -this.fwd.z);
    const fx = Math.sin(this.yaw);
    const fz = -Math.cos(this.yaw);
    this.target.set(position[0] - fx * BACK_M, position[1] + UP_M, position[2] - fz * BACK_M);
    const k = this.initialised ? 1 - Math.exp(-POS_RATE * Math.max(dtS, 0)) : 1;
    this.initialised = true;
    this.camera.position.lerp(this.target, k);
    this.look.set(position[0] + fx * LOOK_AHEAD_M, position[1] + 0.8, position[2] + fz * LOOK_AHEAD_M);
    this.camera.lookAt(this.look);
    const fov = FOV_MIN + (FOV_MAX - FOV_MIN) * Math.min(Math.max(speedKmh / TOP_SPEED_KMH, 0), 1);
    if (Math.abs(fov - this.camera.fov) > 0.01) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
  }
}
