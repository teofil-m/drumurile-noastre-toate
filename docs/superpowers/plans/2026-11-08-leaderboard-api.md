# Leaderboard API Implementation Plan (Plan 2 of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A small Cloudflare Worker + D1 leaderboard API (`POST /scores`, `GET /leaderboard`) with validation, CORS for the game's origin and per-IP rate limiting — tested in the existing root Vitest/Stryker setup and deployed.

**Architecture:** Pure request logic in `api/src/logic/`; a handler `handle(request, deps)` that talks to storage only through a `ScoreStore` interface; a thin D1 implementation of that interface; `api/src/index.ts` wires it for Workers. Everything except the D1 store and the Worker entry is tested with root Vitest 5 using an in-memory fake store (no separate package, no Workers test pool). The D1 store is verified by `wrangler dev` and a live smoke test after deploy.

**Tech Stack:** Cloudflare Workers, D1, Wrangler 4 (root devDependency), Vitest 5 + StrykerJS (root), TypeScript ~5.9.

**Spec:** `docs/superpowers/specs/2026-11-07-drumurile-mvp-design.md` §5 (as simplified on 2026-11-08: no edge cache, no Workers test pool, no 403 origin rejection). Shared validation from Plan 1: `src/shared/score.ts`, `src/shared/constants.ts`.

**Human guidance (2026-11-08):** this is a game for colleagues and friends — fun, playable and online beats perfect; keep token cost low. Prefer the simplest thing that satisfies the requirements.

## Global Constraints

- TDD for logic and handler: failing test first, run it, then implement.
- `api/src/logic/**` and `api/src/handler.ts` import no Workers/D1 types; may import `src/shared/**`. Standard ES2022 + Web APIs available in Node 24 (`Request`, `Response`, `URL`, `crypto.subtle`, `TextEncoder`).
- Root config: Vitest `include` adds `api/src/**/*.test.ts`; tsconfig `include` adds `api/src/logic` and `api/src/handler.ts`; Stryker `mutate` adds `api/src/logic/**/*.ts` and `api/src/handler.ts` (tests excluded). Threshold break 80 unchanged.
- Per-module Stryker: `npx stryker run --force --mutate "<explicit non-test files>"`.
- Worker name `drumurile-api-superpowers`; D1 database `drumurile-superpowers` bound as `DB`; var `ALLOWED_ORIGINS = "https://drumurile-superpowers.pages.dev,http://localhost:5173"`; secret `IP_SALT`.
- All responses are JSON (`Content-Type: application/json; charset=utf-8`); errors `{ "error": "<code>" }`; never HTML or stack traces.
- `POST /scores` → 201 `{ id }`. `GET /leaderboard?board=fastest|potholes&limit=1..50` (default 20) → `{ entries: [{ nickname, timeMs, potholes, createdAt }] }`; fastest `time_ms ASC`, potholes `potholes DESC, time_ms ASC` (add `id ASC` as last key; no dedicated tie tests). 5 POST/min per IP → 429. IP stored only as salted SHA-256 hex. Body > 1024 bytes → 413 (checked on actual bytes).
- CORS: an `Origin` in `ALLOWED_ORIGINS` gets `Access-Control-Allow-Origin: <origin>`, `Vary: Origin`, `Access-Control-Allow-Methods: GET, POST, OPTIONS`, `Access-Control-Allow-Headers: Content-Type`; any other or missing origin gets no CORS headers (the browser enforces). `OPTIONS` → 204.
- Commits: conventional-commit messages ending with the Co-Authored-By trailer.

## Review Focus

1. A body over 1024 bytes without a truthful `Content-Length` → 413 (size from actual bytes) → Task 1 test.
2. 6th POST from one IP within a 60 s window → 429; another IP unaffected; next window allowed → Task 2 tests (fake store).
3. A store that throws → 500 `{ error: 'internal' }` JSON with CORS headers → Task 2 test.
4. Multibyte nicknames ("Ștefan") survive end to end (validation normalizes NFC; stored and returned unchanged) → Task 2 test.
5. Unknown path → 404, wrong method → 405, both JSON → Task 2 test.

---

### Task 1: Pure API logic

**Files:**
- Create: `api/src/logic/errors.ts`, `api/src/logic/request.ts`, `api/src/logic/cors.ts`, `api/src/logic/leaderboard.ts`, `api/src/logic/ratelimit.ts` with colocated `*.test.ts`
- Modify: root `vitest.config.ts`, `tsconfig.json`, `stryker.config.json` (see Global Constraints)

**Interfaces (produced):**
```ts
// errors.ts
export type ApiErrorCode = ValidationError | 'not_found' | 'method_not_allowed' | 'unsupported_media_type'
  | 'payload_too_large' | 'invalid_json' | 'invalid_board' | 'invalid_limit' | 'rate_limited' | 'internal';
export function errorStatus(code: ApiErrorCode): number; // ValidationError/invalid_* → 400, not_found 404, method_not_allowed 405, payload_too_large 413, unsupported_media_type 415, rate_limited 429, internal 500
// request.ts
export function isJsonContentType(contentType: string | null): boolean; // media type application/json, case-insensitive, params allowed
export type ParsedBody = { ok: true; value: unknown } | { ok: false; error: 'payload_too_large' | 'invalid_json' };
export function parseBody(text: string): ParsedBody; // UTF-8 byte length > MAX_BODY_BYTES → payload_too_large; then JSON.parse
// cors.ts
export function parseAllowedOrigins(value: string | undefined): string[]; // comma-split, trimmed, empties dropped
export function corsHeaders(origin: string | null, allowed: readonly string[]): Record<string, string>; // exact match → 4 headers above; else {}
// leaderboard.ts
export type Board = 'fastest' | 'potholes';
export type LeaderboardQuery = { ok: true; board: Board; limit: number } | { ok: false; error: 'invalid_board' | 'invalid_limit' };
export function parseLeaderboardQuery(params: URLSearchParams): LeaderboardQuery; // board required; limit digits only, 1..50, default 20
// ratelimit.ts
export const RATE_LIMIT = { windowS: 60, maxPerWindow: 5 } as const;
export function windowStart(nowMs: number): number;              // epoch seconds floored to window
export function isRateLimited(countAfterIncrement: number): boolean; // > maxPerWindow
export async function hashIp(ip: string, salt: string): Promise<string>; // hex SHA-256 of `${salt}:${ip}`
```

- [ ] **Step 1: Failing tests** — `errorStatus` table for every code; `isJsonContentType`: `'application/json'`, `'Application/JSON; charset=utf-8'` true, `null`/`'text/plain'`/`'application/jsonp'` false; `parseBody`: exactly 1024 bytes ok, 1025 bytes → `payload_too_large`, a multibyte string with `.length` ≤ 1024 but > 1024 bytes → `payload_too_large`, `'{oops'` → `invalid_json`; `parseAllowedOrigins(' https://a.dev , ,http://localhost:5173 ')` → 2 entries, `undefined` → `[]`; `corsHeaders` exact object for an allowed origin, `{}` for null and for `'https://evil.dev'`; leaderboard query: fastest default 20, `potholes&limit=50` ok, missing/unknown board → `invalid_board`, limit `0`/`51`/`1.5`/`abc`/`''` → `invalid_limit`; `windowStart(59_999)=0`, `(60_000)=60`; `isRateLimited(5)=false`, `(6)=true`; `hashIp` 64 lowercase hex, deterministic, differs by salt and by IP.
- [ ] **Step 2: Run to verify fail** — `npx vitest run api/src/logic` → FAIL.
- [ ] **Step 3: Implement** the five modules and root config changes.
- [ ] **Step 4: Verify** — `npm test && npm run typecheck`.
- [ ] **Step 5: Stryker** — `npx stryker run --force --mutate "api/src/logic/errors.ts,api/src/logic/request.ts,api/src/logic/cors.ts,api/src/logic/leaderboard.ts,api/src/logic/ratelimit.ts"` → ≥80%.
- [ ] **Step 6: Commit** — `feat(api): add pure request logic`

---

### Task 2: Handler, D1 store, Worker entry, CI

**Files:**
- Create: `api/src/store.ts` (interface), `api/src/handler.ts`, `api/src/handler.test.ts`, `api/src/memoryStore.ts` (test fake, in the same dir so the test can import it), `api/src/d1Store.ts`, `api/src/index.ts`, `api/migrations/0001_init.sql`, `api/wrangler.toml`, `api/tsconfig.json` (Workers types, for typechecking `d1Store.ts`/`index.ts`)
- Modify: root `package.json` (devDeps `wrangler`, `@cloudflare/workers-types`; scripts `api:dev` = `wrangler dev --config api/wrangler.toml`, `api:typecheck` = `tsc -p api/tsconfig.json`), `.github/workflows/ci.yml` (add `npm run api:typecheck` step; bump `actions/checkout` and `actions/setup-node` to current majors — Node 20 runtime deprecation warning on run 42484123408)

**Interfaces:**
```ts
// store.ts
export interface StoredScore { nickname: string; timeMs: number; potholes: number; clientVersion: string; ipHash: string }
export interface LeaderboardEntry { nickname: string; timeMs: number; potholes: number; createdAt: string }
export interface ScoreStore {
  incrementRateLimit(ipHash: string, windowStart: number): Promise<number>; // returns count after increment
  insertScore(score: StoredScore): Promise<number>;                          // returns new id
  top(board: Board, limit: number): Promise<LeaderboardEntry[]>;              // ordered per Global Constraints
}
// handler.ts
export interface HandlerDeps { store: ScoreStore; allowedOrigins: readonly string[]; ipSalt: string; now(): number }
export async function handle(request: Request, deps: HandlerDeps): Promise<Response>;
```
`memoryStore.ts` exports `createMemoryStore(): ScoreStore & { scores: (StoredScore & { id: number; createdAt: string })[] }` with the same ordering rules (used by tests only).
POST order: route → content type (415) → read text → `parseBody` (413/400) → `validateSubmission` (400 with its code) → rate limit via `incrementRateLimit(hashIp(CF-Connecting-IP ?? 'unknown'), windowStart(now()))` (429) → `insertScore` → 201 `{ id }`. Whole handler in try/catch → 500 `internal`. Every response gets `corsHeaders(origin, allowedOrigins)` and the JSON content type.
`d1Store.ts`: `createD1Store(db: D1Database): ScoreStore` — rate limit `INSERT INTO rate_limits (ip_hash, window_start, count) VALUES (?1, ?2, 1) ON CONFLICT(ip_hash, window_start) DO UPDATE SET count = count + 1 RETURNING count`; insert `RETURNING id`; top uses `ORDER BY time_ms ASC, id ASC` / `ORDER BY potholes DESC, time_ms ASC, id ASC` with `LIMIT ?1`.
Migration (exact):
```sql
CREATE TABLE scores (id INTEGER PRIMARY KEY AUTOINCREMENT, nickname TEXT NOT NULL, time_ms INTEGER NOT NULL, potholes INTEGER NOT NULL, client_version TEXT NOT NULL, ip_hash TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')));
CREATE INDEX idx_scores_fastest ON scores (time_ms, id);
CREATE INDEX idx_scores_potholes ON scores (potholes DESC, time_ms, id);
CREATE TABLE rate_limits (ip_hash TEXT NOT NULL, window_start INTEGER NOT NULL, count INTEGER NOT NULL, PRIMARY KEY (ip_hash, window_start));
```
`wrangler.toml`: `name`, `main = "src/index.ts"`, `compatibility_date = "2026-11-01"`, `[vars] ALLOWED_ORIGINS`, `[[d1_databases]] binding = "DB"`, `database_name = "drumurile-superpowers"`, `database_id = "local-placeholder"`, `migrations_dir = "migrations"`.

- [ ] **Step 1: Failing handler tests** (fake store, allowed origin `http://localhost:5173`, fixed `now`):
  - valid POST → 201 `{ id }`, stored nickname trimmed/NFC (`'  Ștefan '` → `'Ștefan'`), `ipHash` 64-hex ≠ IP, CORS header present (Review Focus 4).
  - `timeMs: 179999` → 400 `time_too_fast`; `text/plain` → 415; `{oops` → 400 `invalid_json`; 1025-byte body → 413.
  - 5 POSTs from `CF-Connecting-IP: 9.9.9.9` → 201, 6th → 429; then `8.8.8.8` → 201; after advancing `now` by 60 s, `9.9.9.9` → 201 (Review Focus 2).
  - GET `board=fastest` returns ascending `timeMs`, `board=potholes` descending `potholes`, `limit=2` returns 2, entry shape exact; `board=nope` → 400 `invalid_board`.
  - `OPTIONS /scores` → 204 with CORS headers for allowed origin; GET from `https://evil.dev` → 200 with no `Access-Control-Allow-Origin`.
  - `GET /nope` → 404, `GET /scores` → 405 (Review Focus 5); store whose methods throw → 500 `internal` with CORS headers (Review Focus 3).
- [ ] **Step 2: Run to verify fail.** — **Step 3: Implement** handler, store interface, fake, D1 store, Worker entry, migration, wrangler config, root scripts, CI changes.
- [ ] **Step 4: Verify** — `npm run typecheck && npm test && npm run api:typecheck && npm run build`; Stryker `--mutate "api/src/handler.ts"` ≥80%; then full `npx stryker run --force` ≥80%.
- [ ] **Step 5: Local D1 sanity check** — `npx wrangler d1 migrations apply drumurile-superpowers --local --config api/wrangler.toml`, `npm run api:dev` in background, `curl` one valid POST (with `Content-Type: application/json`) and one GET; expect 201 then the entry. Stop the dev server. Record the output in the report.
- [ ] **Step 6: Commit** — `feat(api): add handler, D1 store, worker entry and CI typecheck`

---

### Task 3: Deploy (human-in-the-loop, controller-run)

The controller runs this with the human; it needs their Cloudflare login. Ask before each outward step.

- [ ] **Step 1:** Human runs `! npx wrangler login` and confirms with `npx wrangler whoami`.
- [ ] **Step 2:** `npx wrangler d1 create drumurile-superpowers` → put `database_id` in `api/wrangler.toml`.
- [ ] **Step 3:** `npx wrangler d1 migrations apply drumurile-superpowers --remote --config api/wrangler.toml`.
- [ ] **Step 4:** Generate a random salt and `npx wrangler secret put IP_SALT --config api/wrangler.toml` (never printed or committed).
- [ ] **Step 5:** `npx wrangler deploy --config api/wrangler.toml` → note the `*.workers.dev` URL.
- [ ] **Step 6: Smoke test** — GET fastest → 200; valid POST → 201; GET shows it; POST `timeMs: 1000` → 400 `time_too_fast`; then delete the smoke row with `wrangler d1 execute … --remote --command "DELETE FROM scores WHERE nickname = '<smoke>'"`.
- [ ] **Step 7:** Add the API URL and deploy/dev commands to `README.md` (short section); commit `chore(api): deploy to Cloudflare`.

---

## Next plan
- **Plan 3 – Game client**: sim/render/ui/adapters (localStorage adapter must never throw; API client against the Task 3 URL), Cloudflare Pages deploy, playtest. Physics must cap speed at `TOP_SPEED_KMH`.
