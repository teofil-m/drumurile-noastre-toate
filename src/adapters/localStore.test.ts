import { describe, expect, it } from 'vitest';
import { createLocalStore } from './localStore';

describe('createLocalStore', () => {
  it('uses the storage when it works', () => {
    const data = new Map<string, string>();
    const st = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) } as unknown as Storage;
    const s = createLocalStore(st);
    expect(s.get('a')).toBeNull();
    s.set('a', '1');
    expect(data.get('a')).toBe('1');
    expect(s.get('a')).toBe('1');
  });
  it('falls back to memory when storage throws', () => {
    const boom = () => {
      throw new Error('x');
    };
    const s = createLocalStore({ getItem: boom, setItem: boom } as unknown as Storage);
    expect(s.get('a')).toBeNull();
    s.set('a', '1');
    expect(s.get('a')).toBe('1');
  });
  it('works with null storage', () => {
    const s = createLocalStore(null);
    s.set('k', 'v');
    expect(s.get('k')).toBe('v');
    expect(s.get('z')).toBeNull();
  });
  it('reads memory only for keys whose write failed', () => {
    const data = new Map<string, string>([['b', 'real']]);
    const st = {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => {
        if (k === 'a') throw new Error('full');
        data.set(k, v);
      },
    } as unknown as Storage;
    const s = createLocalStore(st);
    s.set('a', '1');
    expect(s.get('a')).toBe('1');
    expect(s.get('b')).toBe('real');
  });
  it('prefers storage again once a write succeeds after a failure', () => {
    const data = new Map<string, string>();
    let fail = true;
    const st = {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => {
        if (fail) throw new Error('full');
        data.set(k, v);
      },
    } as unknown as Storage;
    const s = createLocalStore(st);
    s.set('a', '1');
    fail = false;
    s.set('a', '2');
    expect(s.get('a')).toBe('2');
  });
  it('defaults to globalThis.localStorage, and survives it throwing on access', () => {
    const data = new Map<string, string>();
    const fake = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
    const g = globalThis as Record<string, unknown>;
    Object.defineProperty(g, 'localStorage', { value: fake, configurable: true });
    try {
      createLocalStore().set('q', 'z');
      expect(data.get('q')).toBe('z');
      Object.defineProperty(g, 'localStorage', {
        get() {
          throw new Error('denied');
        },
        configurable: true,
      });
      const s = createLocalStore();
      s.set('q', 'y');
      expect(s.get('q')).toBe('y');
    } finally {
      delete g.localStorage;
    }
  });
});
