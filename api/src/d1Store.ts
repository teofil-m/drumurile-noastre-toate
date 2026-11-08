import type { Board } from './logic/leaderboard';
import type { LeaderboardEntry, ScoreStore } from './store';

const ORDER: Record<Board, string> = {
  fastest: 'time_ms ASC, id ASC',
  potholes: 'potholes DESC, time_ms ASC, id ASC',
};

export function createD1Store(db: D1Database): ScoreStore {
  return {
    async incrementRateLimit(ipHash, windowStart) {
      const row = await db
        .prepare(
          'INSERT INTO rate_limits (ip_hash, window_start, count) VALUES (?1, ?2, 1) ON CONFLICT(ip_hash, window_start) DO UPDATE SET count = count + 1 RETURNING count',
        )
        .bind(ipHash, windowStart)
        .first<{ count: number }>();
      if (!row) throw new Error('rate limit upsert returned no row');
      return row.count;
    },
    async insertScore(score) {
      const row = await db
        .prepare(
          'INSERT INTO scores (nickname, time_ms, potholes, client_version, ip_hash) VALUES (?1, ?2, ?3, ?4, ?5) RETURNING id',
        )
        .bind(score.nickname, score.timeMs, score.potholes, score.clientVersion, score.ipHash)
        .first<{ id: number }>();
      if (!row) throw new Error('insert returned no row');
      return row.id;
    },
    async top(board, limit) {
      const { results } = await db
        .prepare(
          `SELECT nickname, time_ms AS timeMs, potholes, created_at AS createdAt FROM scores ORDER BY ${ORDER[board]} LIMIT ?1`,
        )
        .bind(limit)
        .all<LeaderboardEntry>();
      return results;
    },
  };
}
