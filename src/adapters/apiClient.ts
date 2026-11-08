import type { ScoreSubmission } from '../shared/score';

export type ApiFailure = { ok: false; error: string };

export interface LeaderboardEntry {
  nickname: string;
  timeMs: number;
  potholes: number;
  createdAt: string;
}

export interface ApiClient {
  submitScore(sub: ScoreSubmission): Promise<{ ok: true; id: number } | ApiFailure>;
  leaderboard(
    board: 'fastest' | 'potholes',
    limit?: number,
  ): Promise<{ ok: true; entries: LeaderboardEntry[] } | ApiFailure>;
}

const OFFLINE: ApiFailure = { ok: false, error: 'offline' };

type Parsed = { status: number; ok: boolean; body: Record<string, unknown> };

async function call(f: typeof fetch, url: string, init?: RequestInit): Promise<Parsed | null> {
  try {
    const res = await f(url, init);
    const body: unknown = await res.json();
    if (typeof body !== 'object' || body === null) return null;
    return { status: res.status, ok: res.ok, body: body as Record<string, unknown> };
  } catch {
    return null;
  }
}

function failure(p: Parsed): ApiFailure {
  const e = p.body.error;
  return { ok: false, error: typeof e === 'string' ? e : `http_${p.status}` };
}

export function createApiClient(baseUrl: string, fetchImpl?: typeof fetch): ApiClient {
  const base = baseUrl.replace(/\/$/, '');
  const f: typeof fetch = fetchImpl ?? ((input, init) => fetch(input, init));
  return {
    async submitScore(sub) {
      const p = await call(f, `${base}/scores`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sub),
      });
      if (!p) return OFFLINE;
      if (!p.ok) return failure(p);
      return typeof p.body.id === 'number' ? { ok: true, id: p.body.id } : OFFLINE;
    },
    async leaderboard(board, limit = 20) {
      const p = await call(f, `${base}/leaderboard?board=${board}&limit=${limit}`);
      if (!p) return OFFLINE;
      if (!p.ok) return failure(p);
      return Array.isArray(p.body.entries)
        ? { ok: true, entries: p.body.entries as LeaderboardEntry[] }
        : OFFLINE;
    },
  };
}
