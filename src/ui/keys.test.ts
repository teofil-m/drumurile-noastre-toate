import { describe, expect, it } from 'vitest';
import { controlsFromKeys } from './keys';

const c = (...k: string[]) => controlsFromKeys(new Set(k));
const zero = { throttle: 0, brake: 0, steer: 0, handbrake: false };

describe('controlsFromKeys', () => {
  it('none', () => expect(c()).toEqual(zero));
  it('throttle', () => {
    expect(c('KeyW')).toEqual({ ...zero, throttle: 1 });
    expect(c('ArrowUp')).toEqual({ ...zero, throttle: 1 });
  });
  it('brake', () => {
    expect(c('KeyS')).toEqual({ ...zero, brake: 1 });
    expect(c('ArrowDown')).toEqual({ ...zero, brake: 1 });
  });
  it('steer', () => {
    expect(c('KeyA')).toEqual({ ...zero, steer: -1 });
    expect(c('ArrowLeft')).toEqual({ ...zero, steer: -1 });
    expect(c('KeyD')).toEqual({ ...zero, steer: 1 });
    expect(c('ArrowRight')).toEqual({ ...zero, steer: 1 });
    expect(c('KeyA', 'KeyD').steer).toBe(0);
    expect(c('ArrowLeft', 'KeyD').steer).toBe(0);
  });
  it('handbrake', () => expect(c('Space')).toEqual({ ...zero, handbrake: true }));
  it('ignores others', () => expect(c('KeyQ')).toEqual(zero));
});
