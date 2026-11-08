import { validateSubmission } from '../../src/shared/score';
import { corsHeaders } from './logic/cors';
import { errorStatus, type ApiErrorCode } from './logic/errors';
import { parseLeaderboardQuery } from './logic/leaderboard';
import { hashIp, isRateLimited, windowStart } from './logic/ratelimit';
import { isJsonContentType, parseBody } from './logic/request';
import type { ScoreStore } from './store';

export interface HandlerDeps {
  store: ScoreStore;
  allowedOrigins: readonly string[];
  ipSalt: string;
  now(): number;
}

const JSON_TYPE = 'application/json; charset=utf-8';

function json(status: number, body: unknown, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': JSON_TYPE },
  });
}

function fail(code: ApiErrorCode, cors: Record<string, string>): Response {
  return json(errorStatus(code), { error: code }, cors);
}

async function postScore(request: Request, deps: HandlerDeps, cors: Record<string, string>) {
  if (!isJsonContentType(request.headers.get('Content-Type'))) {
    return fail('unsupported_media_type', cors);
  }
  const parsed = parseBody(await request.text());
  if (!parsed.ok) return fail(parsed.error, cors);
  const validated = validateSubmission(parsed.value);
  if (!validated.ok) return fail(validated.error, cors);

  const ipHash = await hashIp(request.headers.get('CF-Connecting-IP') ?? 'unknown', deps.ipSalt);
  const count = await deps.store.incrementRateLimit(ipHash, windowStart(deps.now()));
  if (isRateLimited(count)) return fail('rate_limited', cors);

  const id = await deps.store.insertScore({ ...validated.value, ipHash });
  return json(201, { id }, cors);
}

async function getLeaderboard(url: URL, deps: HandlerDeps, cors: Record<string, string>) {
  const query = parseLeaderboardQuery(url.searchParams);
  if (!query.ok) return fail(query.error, cors);
  const entries = await deps.store.top(query.mode, query.board, query.limit);
  return json(200, { entries }, cors);
}

export async function handle(request: Request, deps: HandlerDeps): Promise<Response> {
  const cors = corsHeaders(request.headers.get('Origin'), deps.allowedOrigins);
  try {
    const url = new URL(request.url);
    if (url.pathname !== '/scores' && url.pathname !== '/leaderboard') {
      return fail('not_found', cors);
    }
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (url.pathname === '/scores' && request.method === 'POST') {
      return await postScore(request, deps, cors);
    }
    if (url.pathname === '/leaderboard' && request.method === 'GET') {
      return await getLeaderboard(url, deps, cors);
    }
    return fail('method_not_allowed', cors);
  } catch {
    return fail('internal', cors);
  }
}
