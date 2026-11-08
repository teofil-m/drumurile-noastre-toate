import { describe, expect, it } from 'vitest';
import { createApiClient } from './apiClient';

const sub = { nickname: 'abc', timeMs: 200000, potholes: 3, clientVersion: '1', mode: 'classic' as const };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

function stub(res: () => Response | Promise<Response>) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const f = (async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return res();
  }) as unknown as typeof fetch;
  return { f, calls };
}

describe('apiClient.submitScore', () => {
  it('201 -> ok with id, posts JSON', async () => {
    const { f, calls } = stub(() => json(201, { id: 7 }));
    const r = await createApiClient('https://x.dev/', f).submitScore(sub);
    expect(r).toEqual({ ok: true, id: 7 });
    expect(calls[0]!.url).toBe('https://x.dev/scores');
    expect(calls[0]!.init?.method).toBe('POST');
    expect(new Headers(calls[0]!.init?.headers).get('Content-Type')).toBe('application/json');
    expect(JSON.parse(String(calls[0]!.init?.body))).toEqual(sub);
  });
  it('400 -> its error code', async () => {
    const { f } = stub(() => json(400, { error: 'time_too_fast' }));
    expect(await createApiClient('https://x.dev', f).submitScore(sub)).toEqual({ ok: false, error: 'time_too_fast' });
  });
  it('JSON error without error field -> http_status', async () => {
    const { f } = stub(() => json(429, { message: 'x' }));
    expect(await createApiClient('https://x.dev', f).submitScore(sub)).toEqual({ ok: false, error: 'http_429' });
  });
  it('fetch rejects -> offline', async () => {
    const { f } = stub(() => Promise.reject(new Error('net')));
    expect(await createApiClient('https://x.dev', f).submitScore(sub)).toEqual({ ok: false, error: 'offline' });
  });
  it('500 HTML -> offline', async () => {
    const { f } = stub(() => new Response('<html>', { status: 500 }));
    expect(await createApiClient('https://x.dev', f).submitScore(sub)).toEqual({ ok: false, error: 'offline' });
  });
  it('JSON null or primitive body -> offline', async () => {
    expect(await createApiClient('https://x.dev', stub(() => json(201, null)).f).submitScore(sub)).toEqual({ ok: false, error: 'offline' });
    expect(await createApiClient('https://x.dev', stub(() => json(400, 5)).f).submitScore(sub)).toEqual({ ok: false, error: 'offline' });
  });
  it('2xx without numeric id -> offline', async () => {
    const { f } = stub(() => json(201, { nope: 1 }));
    expect(await createApiClient('https://x.dev', f).submitScore(sub)).toEqual({ ok: false, error: 'offline' });
  });
});

describe('apiClient.leaderboard', () => {
  const entries = [{ nickname: 'a', timeMs: 1, potholes: 2, createdAt: 'now' }];
  it('parses entries and builds query with default limit', async () => {
    const { f, calls } = stub(() => json(200, { entries }));
    const r = await createApiClient('https://x.dev/', f).leaderboard('fastest');
    expect(r).toEqual({ ok: true, entries });
    expect(calls[0]!.url).toBe('https://x.dev/leaderboard?board=fastest&limit=20');
  });
  it('adds the mode param when given', async () => {
    const { f, calls } = stub(() => json(200, { entries: [] }));
    await createApiClient('https://x.dev', f).leaderboard('fastest', 20, 'short');
    expect(calls[0]!.url).toBe('https://x.dev/leaderboard?board=fastest&limit=20&mode=short');
    expect(calls[0]!.init?.method ?? 'GET').toBe('GET');
  });
  it('custom limit', async () => {
    const { f, calls } = stub(() => json(200, { entries }));
    await createApiClient('https://x.dev', f).leaderboard('potholes', 5);
    expect(calls[0]!.url).toBe('https://x.dev/leaderboard?board=potholes&limit=5');
  });
  it('errors map', async () => {
    expect(await createApiClient('https://x.dev', stub(() => json(400, { error: 'bad_board' })).f).leaderboard('fastest')).toEqual({ ok: false, error: 'bad_board' });
    expect(await createApiClient('https://x.dev', stub(() => Promise.reject(new Error())).f).leaderboard('fastest')).toEqual({ ok: false, error: 'offline' });
    expect(await createApiClient('https://x.dev', stub(() => json(200, { entries: 'x' })).f).leaderboard('fastest')).toEqual({ ok: false, error: 'offline' });
  });
});
