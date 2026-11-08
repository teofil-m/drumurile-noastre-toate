import { describe, expect, it } from 'vitest';
import { handle, type HandlerDeps } from './handler';
import { createMemoryStore } from './memoryStore';
import type { ScoreStore } from './store';

const ORIGIN = 'http://localhost:5173';

function setup(store: ScoreStore = createMemoryStore()) {
  const clock = { t: 1_700_000_000_000 };
  const deps: HandlerDeps = { store, allowedOrigins: [ORIGIN], ipSalt: 'salt', now: () => clock.t };
  return { deps, clock };
}

const valid = { nickname: 'Ana', timeMs: 200000, potholes: 3, clientVersion: '1.0.0' };

function post(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('http://api.test/scores', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: ORIGIN, ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

describe('POST /scores', () => {
  it('stores a valid score', async () => {
    const store = createMemoryStore();
    const { deps } = setup(store);
    const res = await handle(
      post({ ...valid, nickname: '  Ștefan ' }, { 'CF-Connecting-IP': '1.2.3.4' }),
      deps,
    );
    expect(res.status).toBe(201);
    expect(res.headers.get('Content-Type')).toBe('application/json; charset=utf-8');
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
    expect(await res.json()).toEqual({ id: 1 });
    expect(store.scores[0]?.nickname).toBe('Ștefan'.normalize('NFC'));
    expect(store.scores[0]?.ipHash).toMatch(/^[0-9a-f]{64}$/);
    expect(store.scores[0]?.ipHash).not.toBe('1.2.3.4');
  });

  it('accepts a short submission at exactly 60 s and stores its mode', async () => {
    const store = createMemoryStore();
    const res = await handle(post({ ...valid, mode: 'short', timeMs: 60000, potholes: 0 }), setup(store).deps);
    expect(res.status).toBe(201);
    expect(store.scores[0]?.mode).toBe('short');
  });

  it('rejects a short submission under 60 s', async () => {
    const res = await handle(post({ ...valid, mode: 'short', timeMs: 59999 }), setup().deps);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'time_too_fast' });
  });

  it('rejects classic at 60 s', async () => {
    const res = await handle(post({ ...valid, mode: 'classic', timeMs: 60000 }), setup().deps);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'time_too_fast' });
  });

  it('stores a missing mode as classic', async () => {
    const store = createMemoryStore();
    await handle(post(valid), setup(store).deps);
    expect(store.scores[0]?.mode).toBe('classic');
  });

  it('rejects an invalid mode', async () => {
    const res = await handle(post({ ...valid, mode: 'nope' }), setup().deps);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'mode_invalid' });
  });

  it('rejects too-fast time', async () => {
    const res = await handle(post({ ...valid, timeMs: 179999 }), setup().deps);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'time_too_fast' });
  });

  it('rejects wrong content type', async () => {
    const req = new Request('http://api.test/scores', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: '{}',
    });
    const res = await handle(req, setup().deps);
    expect(res.status).toBe(415);
    expect(await res.json()).toEqual({ error: 'unsupported_media_type' });
  });

  it('rejects invalid json', async () => {
    const res = await handle(post('{oops'), setup().deps);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid_json' });
  });

  it('rejects oversized body', async () => {
    const res = await handle(post('x'.repeat(1025)), setup().deps);
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: 'payload_too_large' });
  });

  it('rate limits per ip and window', async () => {
    const { deps, clock } = setup();
    const from = (ip: string) => handle(post(valid, { 'CF-Connecting-IP': ip }), deps);
    for (let i = 0; i < 5; i++) expect((await from('9.9.9.9')).status).toBe(201);
    const limited = await from('9.9.9.9');
    expect(limited.status).toBe(429);
    expect(await limited.json()).toEqual({ error: 'rate_limited' });
    expect((await from('8.8.8.8')).status).toBe(201);
    clock.t += 60_000;
    expect((await from('9.9.9.9')).status).toBe(201);
  });
});

describe('GET /leaderboard', () => {
  async function seeded() {
    const store = createMemoryStore();
    const { deps } = setup(store);
    const rows = [
      ['A', 250000, 1],
      ['B', 200000, 5],
      ['C', 300000, 9],
    ] as const;
    await store.insertScore({ nickname: 'S1', timeMs: 70000, potholes: 2, clientVersion: '1', ipHash: 'h', mode: 'short' });
    await store.insertScore({ nickname: 'S2', timeMs: 65000, potholes: 7, clientVersion: '1', ipHash: 'h', mode: 'short' });
    for (const [nickname, timeMs, potholes] of rows) {
      await store.insertScore({ nickname, timeMs, potholes, clientVersion: '1', ipHash: 'h', mode: 'classic' });
    }
    return deps;
  }
  const get = (qs: string, origin = ORIGIN) =>
    new Request(`http://api.test/leaderboard?${qs}`, { headers: { Origin: origin } });

  it('orders fastest ascending and shapes entries', async () => {
    const res = await handle(get('board=fastest'), await seeded());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { entries: Record<string, unknown>[] };
    expect(body.entries.map((e) => e.timeMs)).toEqual([200000, 250000, 300000]);
    expect(Object.keys(body.entries[0] ?? {}).sort()).toEqual([
      'createdAt',
      'nickname',
      'potholes',
      'timeMs',
    ]);
  });

  it('orders potholes descending and honours limit', async () => {
    const res = await handle(get('board=potholes&limit=2'), await seeded());
    const body = (await res.json()) as { entries: { potholes: number }[] };
    expect(body.entries.map((e) => e.potholes)).toEqual([9, 5]);
  });

  it('defaults to classic and filters by mode', async () => {
    const d = await seeded();
    const classic = (await (await handle(get('board=fastest'), d)).json()) as { entries: { nickname: string }[] };
    expect(classic.entries.map((e) => e.nickname)).toEqual(['B', 'A', 'C']);
    const short = (await (await handle(get('board=fastest&mode=short'), d)).json()) as { entries: { nickname: string }[] };
    expect(short.entries.map((e) => e.nickname)).toEqual(['S2', 'S1']);
    const shortP = (await (await handle(get('board=potholes&mode=short'), d)).json()) as { entries: { nickname: string }[] };
    expect(shortP.entries.map((e) => e.nickname)).toEqual(['S2', 'S1']);
  });

  it('rejects unknown mode', async () => {
    const res = await handle(get('board=fastest&mode=nope'), await seeded());
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid_mode' });
  });

  it('rejects unknown board', async () => {
    const res = await handle(get('board=nope'), await seeded());
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid_board' });
  });

  it('omits CORS for disallowed origin', async () => {
    const res = await handle(get('board=fastest', 'https://evil.dev'), await seeded());
    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });
});

describe('routing and errors', () => {
  it('answers preflight on both paths', async () => {
    for (const path of ['/scores', '/leaderboard']) {
      const req = new Request(`http://api.test${path}`, {
        method: 'OPTIONS',
        headers: { Origin: ORIGIN },
      });
      const res = await handle(req, setup().deps);
      expect(res.status).toBe(204);
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
      expect(res.headers.get('Access-Control-Allow-Methods')).toBe('GET, POST, OPTIONS');
    }
  });

  it('404 for unknown path', async () => {
    const res = await handle(new Request('http://api.test/nope'), setup().deps);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'not_found' });
  });

  it('405 for wrong method', async () => {
    const a = await handle(new Request('http://api.test/scores'), setup().deps);
    expect(a.status).toBe(405);
    expect(await a.json()).toEqual({ error: 'method_not_allowed' });
    const b = await handle(
      new Request('http://api.test/leaderboard?board=fastest', { method: 'POST' }),
      setup().deps,
    );
    expect(b.status).toBe(405);
  });

  it('500 internal with CORS when the store throws', async () => {
    const boom = async () => {
      throw new Error('boom');
    };
    const store: ScoreStore = { incrementRateLimit: boom, insertScore: boom, top: boom };
    const { deps } = setup(store);
    const reqs = [
      post(valid),
      new Request('http://api.test/leaderboard?board=fastest', { headers: { Origin: ORIGIN } }),
    ];
    for (const req of reqs) {
      const res = await handle(req, deps);
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: 'internal' });
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
    }
  });
});
