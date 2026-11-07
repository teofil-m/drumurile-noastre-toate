import { FARA_MAINI } from './config';
import { getHazard, HAZARD_IDS } from './hazards';
import type { HazardId, Localized } from './hazards';
import type { KeyValueStore } from './ports';
import type { RunState } from './types';

export type AchievementId =
  | 'prima-gropita'
  | 'bordurist'
  | 'canalistul'
  | 'moartea-planetarelor'
  | 'fara-maini'
  | 'everest'
  | 'gura-iadului'
  | 'fulgerul-de-berceni'
  | 'colectionarul'
  | 'sapator-de-elita'
  | 'ghinion';

export interface Achievement {
  id: AchievementId;
  nameRo: string;
  subtitle: Localized;
}

export const ACHIEVEMENTS_KEY = 'dn.achievements';
export const FULGERUL_MAX_TIME_S = 240;
export const SAPATOR_POTHOLES = 50;

export const ACHIEVEMENTS: readonly Achievement[] = [
  { id: 'prima-gropita', nameRo: 'Prima Gropiță', subtitle: { ro: 'Prima groapă nu se uită', en: 'Your first pothole' } },
  { id: 'bordurist', nameRo: 'Bordurist', subtitle: { ro: 'Ai urcat pe bordură', en: 'You climbed a curb' } },
  { id: 'canalistul', nameRo: 'Canalistul', subtitle: { ro: 'Ai cunoscut canalizarea', en: 'You met the sewer' } },
  { id: 'moartea-planetarelor', nameRo: 'Moartea planetarelor', subtitle: { ro: 'Cutia de viteze a cedat', en: 'The transmission died' } },
  { id: 'fara-maini', nameRo: 'Fără mâini', subtitle: { ro: '5 gropi fără să tragi de volan', en: '5 potholes in a row without steering' } },
  { id: 'everest', nameRo: 'Everest', subtitle: { ro: 'Ai cucerit cea mai înaltă bordură', en: 'You conquered the tallest curb' } },
  { id: 'gura-iadului', nameRo: 'Gura iadului', subtitle: { ro: 'Ai căzut într-o gură de canal', en: 'You fell into an open manhole' } },
  { id: 'fulgerul-de-berceni', nameRo: 'Fulgerul de Berceni', subtitle: { ro: 'Rablă distrusă în sub 4 minute', en: 'Wrecked in under 4 minutes' } },
  { id: 'colectionarul', nameRo: 'Colecționarul', subtitle: { ro: 'Toate tipurile de pericole într-o tură', en: 'Every hazard type in one run' } },
  { id: 'sapator-de-elita', nameRo: 'Săpător de elită', subtitle: { ro: '50 de gropi într-o tură', en: '50 potholes in one run' } },
  { id: 'ghinion', nameRo: 'Ghinion', subtitle: { ro: 'Te-ai lovit de o mașină', en: 'You crashed into traffic' } },
];

const hitKind = (s: RunState, kind: 'curb' | 'manhole'): boolean =>
  s.stats.hazardTypesHit.some((id) => getHazard(id).kind === kind);
const hit = (s: RunState, id: HazardId): boolean => s.stats.hazardTypesHit.includes(id);

const RULES: Record<AchievementId, (s: RunState) => boolean> = {
  'prima-gropita': (s) => s.stats.potholes >= 1,
  bordurist: (s) => hitKind(s, 'curb'),
  canalistul: (s) => hitKind(s, 'manhole'),
  'moartea-planetarelor': (s) => s.detached.includes('transmission'),
  'fara-maini': (s) => s.stats.potholeStreakNoSteer >= FARA_MAINI.streak,
  everest: (s) => hit(s, 'bordura-everest'),
  'gura-iadului': (s) => hit(s, 'gura-iadului'),
  'fulgerul-de-berceni': (s) => s.phase === 'wrecked' && s.timeS < FULGERUL_MAX_TIME_S,
  colectionarul: (s) => HAZARD_IDS.every((id) => hit(s, id)),
  'sapator-de-elita': (s) => s.stats.potholes >= SAPATOR_POTHOLES,
  ghinion: (s) => s.phase === 'dnf',
};

export function evaluateAchievements(state: RunState, unlocked: ReadonlySet<AchievementId>): AchievementId[] {
  return ACHIEVEMENTS.filter((a) => !unlocked.has(a.id) && RULES[a.id](state)).map((a) => a.id);
}

export function loadUnlocked(store: KeyValueStore): Set<AchievementId> {
  const raw = store.get(ACHIEVEMENTS_KEY);
  if (raw === null) return new Set();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return new Set();
  }
  if (!Array.isArray(parsed)) return new Set();
  const known = new Set<string>(ACHIEVEMENTS.map((a) => a.id));
  return new Set(parsed.filter((v): v is AchievementId => typeof v === 'string' && known.has(v)));
}

export function saveUnlocked(store: KeyValueStore, ids: ReadonlySet<AchievementId>): void {
  store.set(ACHIEVEMENTS_KEY, JSON.stringify(ACHIEVEMENTS.filter((a) => ids.has(a.id)).map((a) => a.id)));
}
