import { isGameMode, type GameMode } from '../../../src/shared/modes';

export type Board = 'fastest' | 'potholes';
export type LeaderboardQuery =
  | { ok: true; board: Board; mode: GameMode; limit: number }
  | { ok: false; error: 'invalid_board' | 'invalid_mode' | 'invalid_limit' };

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

export function parseLeaderboardQuery(params: URLSearchParams): LeaderboardQuery {
  const board = params.get('board');
  if (board !== 'fastest' && board !== 'potholes') return { ok: false, error: 'invalid_board' };
  const rawMode = params.get('mode');
  const mode = rawMode === null ? 'classic' : rawMode;
  if (!isGameMode(mode)) return { ok: false, error: 'invalid_mode' };
  const raw = params.get('limit');
  if (raw === null) return { ok: true, board, mode, limit: DEFAULT_LIMIT };
  if (!/^\d+$/.test(raw)) return { ok: false, error: 'invalid_limit' };
  const limit = Number(raw);
  if (limit < 1 || limit > MAX_LIMIT) return { ok: false, error: 'invalid_limit' };
  return { ok: true, board, mode, limit };
}
