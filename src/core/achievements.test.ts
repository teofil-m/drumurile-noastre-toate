import { describe, it, expect } from 'vitest';
import { ACHIEVEMENTS, ACHIEVEMENTS_KEY, evaluateAchievements, loadUnlocked, saveUnlocked } from './achievements';
import type { AchievementId } from './achievements';
import { memoryStore } from './ports';
import { createRun } from './run';
import { HAZARD_IDS } from './hazards';
import type { HazardId } from './hazards';
import type { RunState, RunStats } from './types';

const withStats = (s: Partial<RunStats>, over: Partial<RunState> = {}): RunState => {
  const base = createRun();
  return { ...base, ...over, stats: { ...base.stats, ...s } };
};
const none = new Set<AchievementId>();
const unlocks = (s: RunState): AchievementId[] => evaluateAchievements(s, none);

describe('ACHIEVEMENTS catalog', () => {
  it('has 11 entries with exact ids, names and copy', () => {
    expect(ACHIEVEMENTS.map((a) => [a.id, a.nameRo, a.subtitle.ro, a.subtitle.en])).toEqual([
      ['prima-gropita', 'Prima Gropiță', 'Prima groapă nu se uită', 'Your first pothole'],
      ['bordurist', 'Bordurist', 'Ai urcat pe bordură', 'You climbed a curb'],
      ['canalistul', 'Canalistul', 'Ai cunoscut canalizarea', 'You met the sewer'],
      ['moartea-planetarelor', 'Moartea planetarelor', 'Cutia de viteze a cedat', 'The transmission died'],
      ['fara-maini', 'Fără mâini', '5 gropi fără să tragi de volan', '5 potholes in a row without steering'],
      ['everest', 'Everest', 'Ai cucerit cea mai înaltă bordură', 'You conquered the tallest curb'],
      ['gura-iadului', 'Gura iadului', 'Ai căzut într-o gură de canal', 'You fell into an open manhole'],
      ['fulgerul-de-berceni', 'Fulgerul de Berceni', 'Rablă distrusă în sub 4 minute', 'Wrecked in under 4 minutes'],
      ['colectionarul', 'Colecționarul', 'Toate tipurile de pericole într-o tură', 'Every hazard type in one run'],
      ['sapator-de-elita', 'Săpător de elită', '50 de gropi într-o tură', '50 potholes in one run'],
      ['ghinion', 'Ghinion', 'Te-ai lovit de o mașină', 'You crashed into traffic'],
    ]);
  });
  it('uses the persistence key', () => {
    expect(ACHIEVEMENTS_KEY).toBe('dn.achievements');
  });
});

describe('evaluateAchievements rules', () => {
  it('fresh run unlocks nothing', () => {
    expect(unlocks(createRun())).toEqual([]);
  });
  it('prima-gropita at 1 pothole', () => {
    expect(unlocks(withStats({ potholes: 1 }))).toEqual(['prima-gropita']);
    expect(unlocks(withStats({ potholes: 0 }))).toEqual([]);
  });
  it('bordurist on any curb', () => {
    expect(unlocks(withStats({ hazardTypesHit: ['bordura-protocol'] }))).toEqual(['bordurist']);
    expect(unlocks(withStats({ hazardTypesHit: ['gropita'] }))).toEqual([]);
  });
  it('canalistul on any manhole', () => {
    expect(unlocks(withStats({ hazardTypesHit: ['capac-dansator'] }))).toEqual(['canalistul']);
  });
  it('moartea-planetarelor when transmission detached', () => {
    expect(unlocks(withStats({}, { detached: ['transmission'] }))).toEqual(['moartea-planetarelor']);
    expect(unlocks(withStats({}, { detached: ['bumper'] }))).toEqual([]);
  });
  it('fara-maini at streak 5, not 4', () => {
    expect(unlocks(withStats({ potholeStreakNoSteer: 5 }))).toEqual(['fara-maini']);
    expect(unlocks(withStats({ potholeStreakNoSteer: 4 }))).toEqual([]);
  });
  it('everest on bordura-everest (also bordurist)', () => {
    expect(unlocks(withStats({ hazardTypesHit: ['bordura-everest'] }))).toEqual(['bordurist', 'everest']);
  });
  it('gura-iadului on gura-iadului (also canalistul)', () => {
    expect(unlocks(withStats({ hazardTypesHit: ['gura-iadului'] }))).toEqual(['canalistul', 'gura-iadului']);
  });
  it('fulgerul-de-berceni when wrecked under 240s', () => {
    expect(unlocks(withStats({}, { phase: 'wrecked', timeS: 239.99 }))).toEqual(['fulgerul-de-berceni']);
    expect(unlocks(withStats({}, { phase: 'wrecked', timeS: 240 }))).toEqual([]);
    expect(unlocks(withStats({}, { phase: 'driving', timeS: 10 }))).toEqual([]);
  });
  it('colectionarul needs every hazard type', () => {
    const all = [...HAZARD_IDS];
    expect(unlocks(withStats({ hazardTypesHit: all }))).toContain('colectionarul');
    for (const missing of HAZARD_IDS) {
      const partial = all.filter((h: HazardId) => h !== missing);
      expect(unlocks(withStats({ hazardTypesHit: partial }))).not.toContain('colectionarul');
    }
  });
  it('sapator-de-elita at 50 potholes, not 49', () => {
    expect(unlocks(withStats({ potholes: 50 }))).toEqual(['prima-gropita', 'sapator-de-elita']);
    expect(unlocks(withStats({ potholes: 49 }))).toEqual(['prima-gropita']);
  });
  it('ghinion on dnf', () => {
    expect(unlocks(withStats({}, { phase: 'dnf' }))).toEqual(['ghinion']);
    expect(unlocks(withStats({}, { phase: 'driving' }))).toEqual([]);
  });
  it('does not return already unlocked ids', () => {
    const s = withStats({ potholes: 50 });
    expect(evaluateAchievements(s, new Set<AchievementId>(['prima-gropita']))).toEqual(['sapator-de-elita']);
  });
  it('returns in ACHIEVEMENTS order', () => {
    const s = withStats({ potholes: 1, hazardTypesHit: ['gura-iadului', 'bordura-protocol'] }, { phase: 'dnf' });
    expect(unlocks(s)).toEqual(['prima-gropita', 'bordurist', 'canalistul', 'gura-iadului', 'ghinion']);
  });
});

// Equivalent mutants (achievements.ts): empty catch block (parsed stays undefined, not an array -> empty set) and dropping the typeof-string check (known.has() is false for non-strings).
describe('persistence', () => {
  it('round-trips through memoryStore', () => {
    const store = memoryStore();
    saveUnlocked(store, new Set<AchievementId>(['everest', 'bordurist']));
    expect(loadUnlocked(store)).toEqual(new Set(['everest', 'bordurist']));
  });
  it('saves a JSON array in ACHIEVEMENTS order', () => {
    const store = memoryStore();
    saveUnlocked(store, new Set<AchievementId>(['everest', 'bordurist']));
    expect(store.get(ACHIEVEMENTS_KEY)).toBe('["bordurist","everest"]');
  });
  it('loads empty for missing key', () => {
    expect(loadUnlocked(memoryStore())).toEqual(new Set());
  });
  it.each([
    ['invalid json', '{oops'],
    ['non-array', '{"a":1}'],
    ['string', '"everest"'],
  ])('loads empty for %s', (_n, raw) => {
    expect(loadUnlocked(memoryStore({ [ACHIEVEMENTS_KEY]: raw }))).toEqual(new Set());
  });
  it('filters unknown ids and non-strings', () => {
    expect(loadUnlocked(memoryStore({ [ACHIEVEMENTS_KEY]: '["everest","nope",5,null]' }))).toEqual(new Set(['everest']));
  });
});

describe('memoryStore', () => {
  it('returns null for missing, stores and overwrites', () => {
    const s = memoryStore();
    expect(s.get('k')).toBeNull();
    s.set('k', 'v');
    expect(s.get('k')).toBe('v');
    s.set('k', 'w');
    expect(s.get('k')).toBe('w');
  });
  it('seeds from initial without aliasing it', () => {
    const init = { a: '1' };
    const s = memoryStore(init);
    expect(s.get('a')).toBe('1');
    s.set('b', '2');
    expect(init).toEqual({ a: '1' });
    init.a = 'changed';
    expect(s.get('a')).toBe('1');
  });
});
