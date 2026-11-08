import type { Controls } from '../core/types';

const any = (keys: ReadonlySet<string>, ...codes: string[]): boolean => codes.some((c) => keys.has(c));

export function controlsFromKeys(keys: ReadonlySet<string>): Controls {
  const left = any(keys, 'KeyA', 'ArrowLeft');
  const right = any(keys, 'KeyD', 'ArrowRight');
  return {
    throttle: any(keys, 'KeyW', 'ArrowUp') ? 1 : 0,
    brake: any(keys, 'KeyS', 'ArrowDown') ? 1 : 0,
    steer: (right ? 1 : 0) - (left ? 1 : 0),
    handbrake: keys.has('Space'),
  };
}
