import type { Board } from './logic/leaderboard';

export interface StoredScore {
  nickname: string;
  timeMs: number;
  potholes: number;
  clientVersion: string;
  ipHash: string;
}
export interface LeaderboardEntry {
  nickname: string;
  timeMs: number;
  potholes: number;
  createdAt: string;
}
export interface ScoreStore {
  incrementRateLimit(ipHash: string, windowStart: number): Promise<number>;
  insertScore(score: StoredScore): Promise<number>;
  top(board: Board, limit: number): Promise<LeaderboardEntry[]>;
}
