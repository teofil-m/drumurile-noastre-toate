import { describe, it, expect } from 'vitest';
import { applyEvent, createRun, scoreTimeMs } from './run';
import { TOP_SPEED_KMH } from './config';
import type { HazardId } from './hazards';
import type { RunEvent, RunState } from './types';

const drive = (): RunState => applyEvent(createRun(), { type: 'start' }).state;
const tick = (s: RunState, dtS: number, steerInput = 0) => applyEvent(s, { type: 'tick', dtS, steerInput });
const hit = (s: RunState, hazardId: HazardId, instanceId: string, speedKmh = TOP_SPEED_KMH) =>
  applyEvent(s, { type: 'hazardHit', hazardId, instanceId, speedKmh });
const advance = (s: RunState, totalS: number): RunState => {
  let cur = s;
  for (let i = 0; i < totalS / 0.25; i++) cur = tick(cur, 0.25).state;
  return cur;
};
const deepFreeze = <T>(o: T): T => {
  if (o && typeof o === 'object') {
    if (o instanceof Set) {
      const boom = () => {
        throw new Error('mutated set');
      };
      o.add = boom;
      o.delete = boom;
      o.clear = boom;
    }
    Object.freeze(o);
    for (const v of Object.values(o)) deepFreeze(v);
  }
  return o;
};
const wreck = (): RunState => {
  let s = advance(drive(), 180);
  for (let i = 0; i < 9; i++) s = hit(s, 'craterul-national', `x${i}`).state; // 9 x 120 > 1000
  return s;
};

// Stryker: 'dmg.health <= 0' vs '< 0' in run.ts is an equivalent mutant (applyDamage floors health at 0, never negative); the other survivors are in other files.
describe('run state machine', () => {
  it('createRun starts in menu with full health', () => {
    const s = createRun();
    expect(s.phase).toBe('menu');
    expect(s.health).toBe(1000);
    expect(s.timeS).toBe(0);
    expect(s.damageTaken).toBe(0);
    expect(s.detached).toEqual([]);
    expect(s.stats).toEqual({ potholes: 0, hits: 0, hazardTypesHit: [], potholeStreakNoSteer: 0 });
    expect(s.hitInstanceIds.size).toBe(0);
    expect(s.lastHazard).toBeNull();
    expect(s.clampAbsorbed).toBe(false);
  });

  it('start moves menu to driving and is otherwise a no-op', () => {
    const r = applyEvent(createRun(), { type: 'start' });
    expect(r.state.phase).toBe('driving');
    expect(r.outputs).toEqual([]);
    const d = drive();
    const again = applyEvent(d, { type: 'start' });
    expect(again.state).toBe(d);
    expect(again.outputs).toEqual([]);
  });

  describe('tick', () => {
    it('accumulates time while driving', () => {
      let s = drive();
      for (let i = 0; i < 60; i++) s = tick(s, 1 / 60).state;
      expect(s.timeS).toBeCloseTo(1, 6);
    });
    it('does not advance in menu or paused', () => {
      const m = createRun();
      expect(tick(m, 0.1).state).toBe(m);
      const p = applyEvent(drive(), { type: 'pause' }).state;
      const r = tick(p, 0.1);
      expect(r.state).toBe(p);
      expect(r.outputs).toEqual([]);
    });
    it('clamps dt to MAX_TICK_S', () => {
      expect(tick(drive(), 10).state.timeS).toBe(0.25);
    });
    it.each([[NaN], [-1], [Infinity], [-Infinity]])('treats dt %p as zero advance', (dt) => {
      const t = tick(drive(), dt).state.timeS;
      expect(t).toBe(0);
    });
    it('does not mutate the previous state', () => {
      const s = deepFreeze(drive());
      const r = tick(s, 0.1);
      expect(r.state).not.toBe(s);
      expect(s.timeS).toBe(0);
    });
  });

  describe('hazard hits', () => {
    it('applies damage and records stats', () => {
      const r = hit(drive(), 'gropality', 'a');
      expect(r.state.health).toBe(975);
      expect(r.state.damageTaken).toBe(25);
      expect(r.outputs).toEqual([{ type: 'hazardHit', hazardId: 'gropality', damage: 25 }]);
      expect(r.state.lastHazard).toBe('gropality');
      expect(r.state.stats.potholes).toBe(1);
      expect(r.state.stats.hits).toBe(1);
      expect(r.state.stats.hazardTypesHit).toEqual(['gropality']);
      expect(r.state.hitInstanceIds.has('a')).toBe(true);
    });
    it('ignores a duplicate instanceId', () => {
      const first = hit(drive(), 'gropality', 'a').state;
      const second = hit(first, 'gropality', 'a');
      expect(second.state).toBe(first);
      expect(second.outputs).toEqual([]);
    });
    it('counts curbs as hits but not potholes', () => {
      const s = hit(drive(), 'bordura-protocol', 'c').state;
      expect(s.stats.potholes).toBe(0);
      expect(s.stats.hits).toBe(1);
      expect(s.lastHazard).toBe('bordura-protocol');
    });
    it('keeps hazardTypesHit unique in first-hit order', () => {
      let s = drive();
      s = hit(s, 'gropality', '1').state;
      s = hit(s, 'bordura-protocol', '2').state;
      s = hit(s, 'gropality', '3').state;
      expect(s.stats.hazardTypesHit).toEqual(['gropality', 'bordura-protocol']);
      expect(s.stats.hits).toBe(3);
      expect(s.stats.potholes).toBe(2);
    });
    it('ignores hits outside driving', () => {
      const m = createRun();
      expect(hit(m, 'gropality', 'a').state).toBe(m);
      const p = applyEvent(drive(), { type: 'pause' }).state;
      const r = hit(p, 'gropality', 'a');
      expect(r.state).toBe(p);
      expect(r.outputs).toEqual([]);
    });
    it('NaN speed uses the minimum speed factor and keeps health finite', () => {
      const r = hit(drive(), 'gropality', 'a', NaN);
      expect(r.outputs).toEqual([{ type: 'hazardHit', hazardId: 'gropality', damage: 3 }]);
      expect(r.state.health).toBe(997);
      expect(Number.isFinite(r.state.health)).toBe(true);
    });
    it('does not mutate the previous state or its Set', () => {
      const s = deepFreeze(drive());
      const r = hit(s, 'gropality', 'a');
      expect(s.hitInstanceIds.size).toBe(0);
      expect(s.stats.hits).toBe(0);
      expect(r.state.hitInstanceIds).not.toBe(s.hitInstanceIds);
    });
  });

  describe('pre-180 s clamp and wreck', () => {
    const clamped = (): RunState => {
      let s = drive();
      for (let i = 0; i < 50; i++) s = hit(s, 'craterul-national', `e${i}`, 110).state;
      return s;
    };
    it('clamps at 1 HP before 180 s and remembers it', () => {
      const s = clamped();
      expect(s.health).toBe(1);
      expect(s.damageTaken).toBe(999);
      expect(s.phase).toBe('driving');
      expect(s.clampAbsorbed).toBe(true);
    });
    it('clampAbsorbed stays true after later non-clamped hits', () => {
      let s = advance(clamped(), 180);
      s = hit(s, 'gropita', 'late').state;
      expect(s.clampAbsorbed).toBe(true);
    });
    it('wrecks on a hit at 180 s with 1 HP', () => {
      const s = advance(clamped(), 180);
      expect(s.timeS).toBe(180);
      const r = hit(s, 'gropita', 'final');
      expect(r.state.phase).toBe('wrecked');
      expect(r.state.health).toBe(0);
      expect(r.outputs[0]).toEqual({ type: 'hazardHit', hazardId: 'gropita', damage: 10 });
      expect(r.outputs).toContainEqual({ type: 'wrecked', timeMs: 180000 });
      expect(r.outputs[r.outputs.length - 1]).toEqual({ type: 'wrecked', timeMs: 180000 });
    });
    it('does not report wrecked while health remains', () => {
      const r = hit(drive(), 'gropality', 'a');
      expect(r.outputs.some((o) => o.type === 'wrecked')).toBe(false);
      expect(r.state.phase).toBe('driving');
    });
  });

  describe('part detachment', () => {
    // hit speeds expressed relative to TOP_SPEED_KMH (tuned in Task 11: tier damage applies at top speed).
    it('emits partDetached once when crossing a threshold and accumulates', () => {
      let s = drive();
      let outs: RunOutputs = [];
      for (let i = 0; i < 8; i++) {
        const r = hit(s, 'gropality', `g${i}`);
        s = r.state;
        outs = outs.concat(r.outputs);
      }
      expect(s.damageTaken).toBe(200);
      expect(outs.filter((o) => o.type === 'partDetached')).toEqual([{ type: 'partDetached', part: 'bumper' }]);
      expect(s.detached).toEqual(['bumper']);
      const r = hit(s, 'craterul-national', 'big'); // 320 taken, then more
      expect(r.state.detached).toEqual(['bumper']);
      const r2 = hit(r.state, 'craterul-national', 'big2'); // 440 taken crosses hood
      expect(r2.state.detached).toEqual(['bumper', 'hood']);
      expect(r2.outputs).toEqual([
        { type: 'hazardHit', hazardId: 'craterul-national', damage: 120 },
        { type: 'partDetached', part: 'hood' },
      ]);
    });
    it('emits hazardHit, the final part, then wrecked', () => {
      let s = advance(drive(), 180);
      for (let i = 0; i < 6; i++) s = hit(s, 'craterul-national', `x${i}`).state; // 720 taken
      for (let i = 0; i < 3; i++) s = hit(s, 'groapa-de-gunoi', `g${i}`).state; // 870 taken
      s = hit(s, 'gropita', 'p').state; // 880 taken
      const r = hit(s, 'craterul-national', 'last'); // 120 damage: 1000
      expect(r.state.phase).toBe('wrecked');
      expect(r.outputs).toEqual([
        { type: 'hazardHit', hazardId: 'craterul-national', damage: 120 },
        { type: 'partDetached', part: 'transmission' },
        { type: 'wrecked', timeMs: 180000 },
      ]);
      expect(r.state.detached).toEqual(['bumper', 'hood', 'doorLeft', 'doorRight', 'exhaust', 'transmission']);
    });
    it('emits multiple parts from one hit in threshold order', () => {
      let s = advance(drive(), 180);
      for (let i = 0; i < 7; i++) s = hit(s, 'craterul-national', `x${i}`).state; // 840 taken
      const r = hit(s, 'craterul-national', 'y'); // 960: exhaust (850), transmission (950)
      expect(r.outputs).toEqual([
        { type: 'hazardHit', hazardId: 'craterul-national', damage: 120 },
        { type: 'partDetached', part: 'exhaust' },
        { type: 'partDetached', part: 'transmission' },
      ]);
    });
  });

  describe('traffic collision', () => {
    it('ends the run as dnf when driving', () => {
      const r = applyEvent(drive(), { type: 'trafficCollision' });
      expect(r.state.phase).toBe('dnf');
      expect(r.outputs).toEqual([{ type: 'dnf' }]);
    });
    it('is ignored in menu and paused', () => {
      const m = createRun();
      expect(applyEvent(m, { type: 'trafficCollision' }).state).toBe(m);
      const p = applyEvent(drive(), { type: 'pause' }).state;
      const r = applyEvent(p, { type: 'trafficCollision' });
      expect(r.state).toBe(p);
      expect(r.outputs).toEqual([]);
    });
  });

  describe('terminal phases', () => {
    const dnf = (): RunState => applyEvent(drive(), { type: 'trafficCollision' }).state;
    const events: RunEvent[] = [
      { type: 'hazardHit', hazardId: 'gropita', instanceId: 'zz', speedKmh: 50 },
      { type: 'trafficCollision' },
      { type: 'tick', dtS: 0.1, steerInput: 0 },
      { type: 'start' },
      { type: 'pause' },
      { type: 'resume' },
    ];
    it.each([['wrecked', wreck], ['dnf', dnf]])('%s ignores everything but restart', (_n, make) => {
      const s = make();
      for (const ev of events) {
        const r = applyEvent(s, ev);
        expect(r.state).toBe(s);
        expect(r.outputs).toEqual([]);
      }
    });
  });

  describe('pause, resume and restart', () => {
    it('pause/resume round-trip', () => {
      const p = applyEvent(drive(), { type: 'pause' });
      expect(p.state.phase).toBe('paused');
      expect(p.outputs).toEqual([]);
      const r = applyEvent(p.state, { type: 'resume' });
      expect(r.state.phase).toBe('driving');
      expect(r.outputs).toEqual([]);
    });
    it('pause only from driving, resume only from paused', () => {
      const m = createRun();
      expect(applyEvent(m, { type: 'pause' }).state).toBe(m);
      expect(applyEvent(m, { type: 'resume' }).state).toBe(m);
      const d = drive();
      expect(applyEvent(d, { type: 'resume' }).state).toBe(d);
      const p = applyEvent(d, { type: 'pause' }).state;
      expect(applyEvent(p, { type: 'pause' }).state).toBe(p);
    });
    it('restart is ignored in menu', () => {
      const m = createRun();
      const r = applyEvent(m, { type: 'restart' });
      expect(r.state).toBe(m);
      expect(r.outputs).toEqual([]);
    });
    it('restart from wrecked, dnf, driving and paused gives a fresh driving run', () => {
      let dirty = hit(drive(), 'gropality', 'a').state;
      dirty = tick(dirty, 0.2).state;
      const dnf = applyEvent(dirty, { type: 'trafficCollision' }).state;
      const paused = applyEvent(dirty, { type: 'pause' }).state;
      for (const from of [dirty, paused, dnf, wreck()]) {
        const r = applyEvent(from, { type: 'restart' });
        expect(r.outputs).toEqual([]);
        expect(r.state).toEqual(drive());
      }
    });
    it('allows reusing an instanceId after restart', () => {
      const s = hit(drive(), 'gropality', 'a').state;
      const r = applyEvent(s, { type: 'restart' }).state;
      expect(hit(r, 'gropality', 'a').state.health).toBe(975);
    });
  });

  describe('fara maini streak', () => {
    const three = () => {
      let s = drive();
      for (let i = 0; i < 3; i++) s = hit(s, 'gropita', `p${i}`).state;
      return s;
    };
    it('counts pothole hits without steering', () => {
      expect(three().stats.potholeStreakNoSteer).toBe(3);
    });
    it('resets on steering at the deadzone or beyond, either direction', () => {
      expect(tick(three(), 0.01, 0.2).state.stats.potholeStreakNoSteer).toBe(0);
      expect(tick(three(), 0.01, -0.2).state.stats.potholeStreakNoSteer).toBe(0);
      expect(tick(three(), 0.01, 0.1).state.stats.potholeStreakNoSteer).toBe(0);
    });
    it('keeps the streak under the deadzone', () => {
      expect(tick(three(), 0.01, 0.09).state.stats.potholeStreakNoSteer).toBe(3);
      expect(tick(three(), 0.01, -0.09).state.stats.potholeStreakNoSteer).toBe(3);
    });
    it('keeps the streak on non-finite steerInput', () => {
      expect(tick(three(), 0.01, NaN).state.stats.potholeStreakNoSteer).toBe(3);
      expect(tick(three(), 0.01, Infinity).state.stats.potholeStreakNoSteer).toBe(3);
    });
    it('non-pothole hits leave the streak unchanged', () => {
      expect(hit(three(), 'bordura-protocol', 'c').state.stats.potholeStreakNoSteer).toBe(3);
    });
    it('reaches the Fara Maini streak of 5', () => {
      let s = drive();
      for (let i = 0; i < 5; i++) s = hit(s, 'gropita', `p${i}`).state;
      expect(s.stats.potholeStreakNoSteer).toBe(5);
    });
  });

  describe('scoreTimeMs', () => {
    it('rounds timeS to milliseconds', () => {
      expect(scoreTimeMs({ ...createRun(), timeS: 1.2345 })).toBe(1235);
      expect(scoreTimeMs({ ...createRun(), timeS: 180 })).toBe(180000);
    });
  });
});

type RunOutputs = ReturnType<typeof hit>['outputs'];
