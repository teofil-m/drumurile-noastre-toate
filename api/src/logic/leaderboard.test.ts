import { describe, expect, it } from 'vitest';
import { parseLeaderboardQuery } from './leaderboard';

const q = (s: string) => parseLeaderboardQuery(new URLSearchParams(s));

describe('parseLeaderboardQuery', () => {
  it('defaults limit to 20', () => {
    expect(q('board=fastest')).toEqual({ ok: true, board: 'fastest', limit: 20 });
  });
  it('accepts potholes with limit 50 and limit 1', () => {
    expect(q('board=potholes&limit=50')).toEqual({ ok: true, board: 'potholes', limit: 50 });
    expect(q('board=fastest&limit=1')).toEqual({ ok: true, board: 'fastest', limit: 1 });
  });
  it('rejects missing or unknown board', () => {
    expect(q('')).toEqual({ ok: false, error: 'invalid_board' });
    expect(q('board=slowest')).toEqual({ ok: false, error: 'invalid_board' });
  });
  it.each(['0', '51', '1.5', 'abc', '', '-1', '+5'])('rejects limit %j', (l) => {
    expect(q(`board=fastest&limit=${l}`)).toEqual({ ok: false, error: 'invalid_limit' });
  });
});
