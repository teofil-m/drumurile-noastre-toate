import { describe, expect, it } from 'vitest';
import { memoryStore } from './ports';
import { achievementLabel, DICT, hazardLabel, LANG_KEY, loadLang, saveLang, t } from './i18n';
import type { AchievementId } from './achievements';

const RO_EXPECTED = {
  'menu.play': 'Joacă',
  'menu.leaderboard': 'Clasament',
  'menu.achievements': 'Realizări',
  'menu.language': 'English',
  'hud.health': 'Rablă',
  'hud.speed': 'km/h',
  'hud.time': 'Timp',
  'pause.title': 'Pauză',
  'pause.resume': 'Continuă',
  'result.wrecked': 'Rabla s-a dus!',
  'result.dnf': 'DNF – ai lovit o mașină',
  'result.time': 'Timp: {time}',
  'result.potholes': 'Gropi: {count}',
  'result.newAchievements': 'Realizări noi',
  'result.nickname': 'Poreclă',
  'result.submit': 'Trimite',
  'result.submitted': 'Trimis!',
  'result.offline': 'Clasament indisponibil',
  'result.retry': 'Reîncearcă',
  'result.restart': 'Încă o tură (R)',
  'leaderboard.fastest': 'Cea mai rapidă distrugere',
  'leaderboard.potholes': 'Cele mai multe gropi',
  'leaderboard.empty': 'Niciun scor încă',
  'achievements.locked': 'Blocat',
  'error.physics': 'Motorul fizic nu a pornit',
};

const EN_EXPECTED = {
  'menu.play': 'Play',
  'menu.leaderboard': 'Leaderboard',
  'menu.achievements': 'Achievements',
  'menu.language': 'Română',
  'hud.health': 'Car',
  'hud.speed': 'km/h',
  'hud.time': 'Time',
  'pause.title': 'Paused',
  'pause.resume': 'Resume',
  'result.wrecked': 'Car wrecked!',
  'result.dnf': 'DNF – you hit a car',
  'result.time': 'Time: {time}',
  'result.potholes': 'Potholes: {count}',
  'result.newAchievements': 'New achievements',
  'result.nickname': 'Nickname',
  'result.submit': 'Submit',
  'result.submitted': 'Submitted!',
  'result.offline': 'Leaderboard offline',
  'result.retry': 'Retry',
  'result.restart': 'Another run (R)',
  'leaderboard.fastest': 'Fastest wreck',
  'leaderboard.potholes': 'Most potholes',
  'leaderboard.empty': 'No scores yet',
  'achievements.locked': 'Locked',
  'error.physics': 'Physics engine failed to start',
};

describe('DICT', () => {
  it('holds the exact Romanian strings', () => {
    expect(DICT.ro).toEqual(RO_EXPECTED);
  });
  it('holds the exact English strings', () => {
    expect(DICT.en).toEqual(EN_EXPECTED);
  });
  it('has the same non-empty keys in both languages', () => {
    expect(Object.keys(DICT.en).sort()).toEqual(Object.keys(DICT.ro).sort());
    for (const v of [...Object.values(DICT.ro), ...Object.values(DICT.en)]) expect(v).not.toBe('');
  });
});

describe('t', () => {
  it('returns the plain string for the language', () => {
    expect(t('ro', 'menu.play')).toBe('Joacă');
    expect(t('en', 'menu.play')).toBe('Play');
  });
  it('substitutes params', () => {
    expect(t('en', 'result.time', { time: '3:12.40' })).toBe('Time: 3:12.40');
    expect(t('ro', 'result.potholes', { count: 7 })).toBe('Gropi: 7');
  });
  it('leaves placeholders without a param intact', () => {
    expect(t('en', 'result.time')).toBe('Time: {time}');
    expect(t('en', 'result.time', { other: 'x' })).toBe('Time: {time}');
  });
  it('replaces every occurrence of a placeholder', () => {
    const original = DICT.en['result.time'];
    (DICT.en as Record<string, string>)['result.time'] = '{time} / {time}';
    try {
      expect(t('en', 'result.time', { time: 'x' })).toBe('x / x');
    } finally {
      (DICT.en as Record<string, string>)['result.time'] = original;
    }
  });
});

describe('loadLang / saveLang', () => {
  it('uses the dn.lang key', () => {
    expect(LANG_KEY).toBe('dn.lang');
  });
  it('defaults to ro on empty store', () => {
    expect(loadLang(memoryStore())).toBe('ro');
  });
  it.each(['fr', '', 'EN', 'ro'])('falls back to ro for stored %j', (v) => {
    expect(loadLang(memoryStore({ [LANG_KEY]: v }))).toBe('ro');
  });
  it('round-trips en and ro', () => {
    const store = memoryStore();
    saveLang(store, 'en');
    expect(store.get('dn.lang')).toBe('en');
    expect(loadLang(store)).toBe('en');
    saveLang(store, 'ro');
    expect(store.get('dn.lang')).toBe('ro');
    expect(loadLang(store)).toBe('ro');
  });
});

describe('labels', () => {
  it('hazardLabel keeps Romanian name, localizes subtitle', () => {
    expect(hazardLabel('gropality', 'en')).toEqual({ name: 'Gropality', subtitle: 'Pothole with personality' });
    expect(hazardLabel('gropality', 'ro')).toEqual({ name: 'Gropality', subtitle: 'Groapă cu personalitate' });
  });
  it('achievementLabel keeps Romanian name, localizes subtitle', () => {
    const en = achievementLabel('ghinion', 'en');
    const ro = achievementLabel('ghinion', 'ro');
    expect(en.name).toBe('Ghinion');
    expect(ro.name).toBe('Ghinion');
    expect(en.subtitle).not.toBe(ro.subtitle);
    expect(en.subtitle).not.toBe('');
  });
  it('achievementLabel throws on unknown id', () => {
    expect(() => achievementLabel('nope' as AchievementId, 'ro')).toThrow('unknown achievement: nope');
  });
});
