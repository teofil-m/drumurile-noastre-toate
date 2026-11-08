import { evaluateAchievements, loadUnlocked, saveUnlocked } from '../core/achievements';
import type { AchievementId } from '../core/achievements';
import type { KeyValueStore } from '../core/ports';
import { applyEvent, createRun } from '../core/run';
import type { RunEvent, RunOutput, RunState } from '../core/run';

export interface Session {
  run: RunState;
  unlocked: ReadonlySet<AchievementId>;
  seed: number;
}

export function createSession(seed: number, store: KeyValueStore): Session {
  return { run: createRun(), unlocked: loadUnlocked(store), seed };
}

export function sessionEvent(
  s: Session,
  ev: RunEvent,
  store: KeyValueStore,
): { session: Session; outputs: RunOutput[]; unlockedNow: AchievementId[] } {
  const { state, outputs } = applyEvent(s.run, ev);
  const unlockedNow = evaluateAchievements(state, s.unlocked);
  let unlocked = s.unlocked;
  if (unlockedNow.length > 0) {
    unlocked = new Set([...s.unlocked, ...unlockedNow]);
    saveUnlocked(store, unlocked);
  }
  return { session: { run: state, unlocked, seed: s.seed }, outputs, unlockedNow };
}
