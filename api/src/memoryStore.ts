import type { GameMode } from '../../src/shared/modes';
import type { Board } from './logic/leaderboard';
import type { LeaderboardEntry, ScoreStore, StoredScore } from './store';

export type MemoryScore = StoredScore & { id: number; createdAt: string };

export function createMemoryStore(): ScoreStore & { scores: MemoryScore[] } {
  const scores: MemoryScore[] = [];
  const counts = new Map<string, number>();
  return {
    scores,
    async incrementRateLimit(ipHash, windowStart) {
      const key = `${ipHash}:${windowStart}`;
      const next = (counts.get(key) ?? 0) + 1;
      counts.set(key, next);
      return next;
    },
    async insertScore(score) {
      const id = scores.length + 1;
      scores.push({ ...score, id, createdAt: new Date(0).toISOString() });
      return id;
    },
    async top(mode: GameMode, board: Board, limit: number): Promise<LeaderboardEntry[]> {
      const sorted = scores.filter((s) => s.mode === mode).sort((a, b) =>
        board === 'fastest'
          ? a.timeMs - b.timeMs || a.id - b.id
          : b.potholes - a.potholes || a.timeMs - b.timeMs || a.id - b.id,
      );
      return sorted
        .slice(0, limit)
        .map(({ nickname, timeMs, potholes, createdAt }) => ({ nickname, timeMs, potholes, createdAt }));
    },
  };
}
