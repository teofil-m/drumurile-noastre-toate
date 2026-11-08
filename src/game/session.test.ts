import { describe, expect, it } from 'vitest';
import { memoryStore } from '../core/ports';
import { createSession, sessionEvent, withMode } from './session';

const hit = (id: string) => ({ type: 'hazardHit' as const, hazardId: 'gropality' as const, instanceId: id, speedKmh: 50 });

describe('session', () => {
  it('creates with seed, fresh run and loaded unlocks', () => {
    const store = memoryStore({ 'dn.achievements': JSON.stringify(['bordurist']) });
    const s = createSession(42, store);
    expect(s.seed).toBe(42);
    expect(s.run.phase).toBe('menu');
    expect(s.unlocked.has('bordurist')).toBe(true);
  });
  it('creates a session in the requested mode and can switch an idle session', () => {
    const store = memoryStore();
    const s = createSession(3, store, 'short');
    expect(s.run.mode).toBe('short');
    expect(s.run.maxHp).toBe(300);
    const c = withMode(s, 'classic');
    expect(c.run.mode).toBe('classic');
    expect(c.run.health).toBe(1000);
    expect(c.seed).toBe(3);
    expect(c.unlocked).toBe(s.unlocked);
    expect(withMode(c, 'classic')).toBe(c);
  });
  it('returns a new achievement once and persists it', () => {
    const store = memoryStore();
    const s0 = createSession(1, store);
    const s1 = sessionEvent(s0, { type: 'start' }, store).session;
    const r1 = sessionEvent(s1, hit('a'), store);
    expect(r1.unlockedNow).toEqual(['prima-gropita']);
    expect(r1.outputs.length).toBeGreaterThan(0);
    expect(r1.session.unlocked.has('prima-gropita')).toBe(true);
    expect(r1.session).not.toBe(s1);
    expect(s1.unlocked.has('prima-gropita')).toBe(false);
    expect(store.get('dn.achievements')).toContain('prima-gropita');
    const r2 = sessionEvent(r1.session, hit('b'), store);
    expect(r2.unlockedNow).toEqual([]);
    expect(r2.session.seed).toBe(1);
  });
  it('does not write when nothing unlocked', () => {
    const writes: string[] = [];
    const store = { get: () => null, set: (k: string) => void writes.push(k) };
    const s = createSession(1, store);
    sessionEvent(s, { type: 'start' }, store);
    expect(writes).toEqual([]);
  });
});
