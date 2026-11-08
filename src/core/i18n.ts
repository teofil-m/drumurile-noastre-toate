import { ACHIEVEMENTS } from './achievements';
import type { AchievementId } from './achievements';
import { getHazard } from './hazards';
import type { HazardId } from './hazards';
import type { KeyValueStore } from './ports';

export type Lang = 'ro' | 'en';
export const LANG_KEY = 'dn.lang';

const RO = {
  'menu.playShort': 'Joacă scurt (300 HP)',
  'menu.playClassic': 'Joacă clasic (1000 HP)',
  'mode.short': 'Scurt',
  'mode.classic': 'Clasic',
  'result.mode': 'Mod: {mode}',
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
  'menu.title': 'Drumurile noastre',
  'pause.restart': 'Repornește (R)',
  'pause.menu': 'Meniu',
  'nav.back': 'Înapoi',
  'nav.loading': 'Se încarcă…',
  'result.nicknameInvalid': 'Poreclă invalidă (2–16 litere, cifre, spațiu, _ sau -)',
  'result.leaderboard': 'Clasament',
  'result.menu': 'Meniu',
  'result.submitting': 'Se trimite…',
  'result.failed': 'Trimiterea a eșuat',
} as const;

export type MessageKey = keyof typeof RO;

const EN: Record<MessageKey, string> = {
  'menu.playShort': 'Play short (300 HP)',
  'menu.playClassic': 'Play classic (1000 HP)',
  'mode.short': 'Short',
  'mode.classic': 'Classic',
  'result.mode': 'Mode: {mode}',
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
  'menu.title': 'Drumurile noastre',
  'pause.restart': 'Restart (R)',
  'pause.menu': 'Menu',
  'nav.back': 'Back',
  'nav.loading': 'Loading…',
  'result.nicknameInvalid': 'Invalid nickname (2–16 letters, digits, space, _ or -)',
  'result.leaderboard': 'Leaderboard',
  'result.menu': 'Menu',
  'result.submitting': 'Submitting…',
  'result.failed': 'Submit failed',
};

export const DICT: Record<Lang, Record<MessageKey, string>> = { ro: RO, en: EN };

export function t(lang: Lang, key: MessageKey, params: Record<string, string | number> = {}): string {
  let text = DICT[lang][key];
  for (const [name, value] of Object.entries(params)) {
    text = text.split(`{${name}}`).join(String(value));
  }
  return text;
}

export function loadLang(store: KeyValueStore): Lang {
  return store.get(LANG_KEY) === 'en' ? 'en' : 'ro';
}

export function saveLang(store: KeyValueStore, lang: Lang): void {
  store.set(LANG_KEY, lang);
}

export function hazardLabel(id: HazardId, lang: Lang): { name: string; subtitle: string } {
  const hazard = getHazard(id);
  return { name: hazard.nameRo, subtitle: hazard.subtitle[lang] };
}

export function achievementLabel(id: AchievementId, lang: Lang): { name: string; subtitle: string } {
  const achievement = ACHIEVEMENTS.find((a) => a.id === id);
  if (!achievement) throw new Error(`unknown achievement: ${id}`);
  return { name: achievement.nameRo, subtitle: achievement.subtitle[lang] };
}
