# Leaderboard API Implementation Plan (Plan 2 of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Cloudflare Worker + D1 leaderboard API (`POST /scores`, `GET /leaderboard`) with validation, CORS and per-IP rate limiting, built test-first, mutation-gated on its pure logic, integration-tested against local D1, and deployed.

**Architecture:** All request decisions live in pure functions under `api/src/logic/` (no Workers types, no D1), unit-tested and Stryker-mutated from the **root** project exactly like `src/core`. `api/src/index.ts` is a thin Worker that wires those functions to D1 and the Cache API. `api/` is its own npm package because `@cloudflare/vitest-pool-workers` (integration tests against real local D1) requires Vitest 4 while the root uses Vitest 5.

**Tech Stack:** Cloudflare Workers, D1, Wrangler 4, `@cloudflare/vitest-pool-workers` 0.23 + Vitest 4 (in `api/`), Vitest 5 + StrykerJS (root), TypeScript ~5.9.

**Spec:** `docs/superpowers/specs/2026-11-07-drumurile-mvp-design.md` (§5 API, §8 Testing and CI). Shared validation from Plan 1: `src/shared/score.ts`, `src/shared/constants.ts`.

## Global Constraints

- Strict TDD: every behavior starts as a failing test that is run and seen to fail.
- `api/src/logic/**` imports nothing from Workers runtime types, D1, or `api/src/index.ts`; it may import `src/shared/**`. Only standard ES2022 + Web Crypto (`crypto.subtle`, `TextEncoder`).
- Root project: `api/src/logic/**/*.test.ts` run under root Vitest; Stryker `mutate` adds `api/src/logic/**/*.ts` (tests excluded); thresholds unchanged (break 80).
- Per-module Stryker runs: `npx stryker run --force --mutate "<explicit non-test files>"` (never a glob).
- `api/` package: `wrangler`, `vitest@^4.1`, `@cloudflare/vitest-pool-workers@^0.23`, `@cloudflare/workers-types`, `typescript@~5.9`. Integration tests in `api/test/*.test.ts` (not mutated).
- Worker name `drumurile-api-superpowers`; D1 database `drumurile-superpowers` bound as `DB`; vars `ALLOWED_ORIGINS = "https://drumurile-superpowers.pages.dev,http://localhost:5173"`; secret `IP_SALT`.
- Every response body is JSON; errors are `{ "error": "<code>" }`. Never return HTML or a stack trace.
- Endpoints, limits and ordering exactly as spec §5: `POST /scores` → 201 `{ id }`; `GET /leaderboard?board=fastest|potholes&limit=1..50` (default 20) → `{ entries: [{ nickname, timeMs, potholes, createdAt }] }`; fastest = `time_ms ASC`, potholes = `potholes DESC, time_ms ASC`; edge-cached 30 s; 5 POST/min per IP; IP stored only as salted SHA-256 hex.
- Commit after every task; conventional-commit messages ending with the Co-Authored-By trailer.

## Review Focus

1. A body over 1024 bytes sent without (or with a lying) `Content-Length` must still be rejected with 413 — the size check runs on the actual body bytes, not only the header → Task 2 unit test + Task 4 integration test.
2. Ties on the leaderboard must order deterministically (fastest: `time_ms ASC, created_at ASC, id ASC`; potholes: `potholes DESC, time_ms ASC, id ASC`) so two calls never shuffle equal scores → Task 3 unit test + Task 5 integration test.
3. Rate-limit windows: the 6th POST from one IP inside a 60 s window → 429; the first POST in the next window → allowed; different IPs never share a counter → Task 3 unit test + Task 5 integration test.
4. Origin handling: no `Origin` header (curl, server-to-server) is served without CORS headers; an allowed `Origin` gets `Access-Control-Allow-Origin: <origin>` + `Vary: Origin`; a disallowed `Origin` gets 403 `forbidden_origin` on POST and on preflight, and GET is served without CORS headers → Task 2 unit test + Task 5 integration test.
5. Any unexpected failure (D1 error, thrown exception) returns 500 `{ "error": "internal" }` with the same CORS headers as a normal response, never an HTML error page → Task 4 integration test.

---

### Task 1: API package scaffold + error codes + router

**Files:**
- Create: `api/package.json`, `api/tsconfig.json`, `api/wrangler.toml`, `api/vitest.config.ts`, `api/src/index.ts` (placeholder Worker returning 404 JSON via the logic modules), `api/src/logic/errors.ts`, `api/src/logic/router.ts`
- Modify: root `vitest.config.ts` (include `api/src/logic/**/*.test.ts`), root `tsconfig.json` (include `api/src/logic`), root `stryker.config.json` (mutate `api/src/logic/**/*.ts`, exclude `!api/**/*.test.ts`), root `.gitignore` (`api/node_modules/`, `api/.wrangler/`)
- Test: `api/src/logic/errors.test.ts`, `api/src/logic/router.test.ts`

**Interfaces:**
- Consumes: `ValidationError` from `src/shared/score.ts`.
- Produces:
  ```ts
  // errors.ts
  export type ApiErrorCode = ValidationError | 'not_found' | 'method_not_allowed' | 'unsupported_media_type'
    | 'payload_too_large' | 'invalid_json' | 'invalid_board' | 'invalid_limit' | 'rate_limited'
    | 'forbidden_origin' | 'internal';
  export function errorStatus(code: ApiErrorCode): number;
  export interface ApiResult { status: number; body: unknown }   // headers are added by the Worker
  export function errorResult(code: ApiErrorCode): ApiResult;     // { status: errorStatus(code), body: { error: code } }
  // router.ts
  export type Route = 'scores' | 'leaderboard' | 'preflight' | 'not_found' | 'method_not_allowed';
  export function route(method: string, pathname: string): Route;
  ```
  Status map: every `ValidationError`, `invalid_json`, `invalid_board`, `invalid_limit` → 400; `forbidden_origin` 403; `not_found` 404; `method_not_allowed` 405; `payload_too_large` 413; `unsupported_media_type` 415; `rate_limited` 429; `internal` 500.
  Routing: `POST /scores` → scores; `GET /leaderboard` → leaderboard; `OPTIONS` on either path → preflight; other methods on either path → method_not_allowed; any other path → not_found. Trailing slash (`/scores/`) is treated as the same path; matching is case-sensitive.

`api/package.json`: `"private": true`, `"type": "module"`, scripts `dev` (`wrangler dev`), `test` (`vitest run`), `typecheck` (`tsc --noEmit`), `deploy` (`wrangler deploy`). `api/tsconfig.json`: strict, ES2022, `moduleResolution: bundler`, `types: ["@cloudflare/workers-types", "@cloudflare/vitest-pool-workers"]`, include `src`, `test`, and `../src/shared`. `api/wrangler.toml`: `name`, `main = "src/index.ts"`, `compatibility_date = "2026-11-01"`, `[vars] ALLOWED_ORIGINS`, `[[d1_databases]] binding = "DB"`, `database_name = "drumurile-superpowers"`, `database_id = "local-placeholder"` (real id set in Task 7), `migrations_dir = "migrations"`. `api/vitest.config.ts`: configure the pool-workers integration per the installed 0.23 docs (wrangler config path, D1 migrations read via `readD1Migrations` and applied in a setup file with `applyD1Migrations`); `include: ['test/**/*.test.ts']`. A smoke integration test `api/test/smoke.test.ts`: `SELF.fetch('https://x/nope')` → 404 `{ error: 'not_found' }` (proves the pool works).

- [ ] **Step 1: Failing unit tests** — `errorStatus` for every code in the map (table-driven, exact numbers); `errorResult('rate_limited')` → `{ status: 429, body: { error: 'rate_limited' } }`; `route` table: `['POST','/scores']→scores`, `['GET','/leaderboard']→leaderboard`, `['OPTIONS','/scores']→preflight`, `['OPTIONS','/leaderboard']→preflight`, `['GET','/scores']→method_not_allowed`, `['DELETE','/leaderboard']→method_not_allowed`, `['POST','/scores/']→scores`, `['GET','/Leaderboard']→not_found`, `['GET','/']→not_found`, `['POST','/scores/extra']→not_found`.
- [ ] **Step 2: Run to verify fail** — `npx vitest run api/src/logic` (root) → FAIL, modules missing.
- [ ] **Step 3: Implement** `errors.ts`, `router.ts`; scaffold `api/` package (`npm install` inside `api/`, commit `api/package-lock.json`); root config changes; placeholder Worker.
- [ ] **Step 4: Verify** — root: `npm test && npm run typecheck`; api: `cd api && npm test && npm run typecheck` (smoke test passes against the pool).
- [ ] **Step 5: Stryker** — `npx stryker run --force --mutate "api/src/logic/errors.ts,api/src/logic/router.ts"` → ≥80%.
- [ ] **Step 6: Commit** — `feat(api): scaffold worker package, error codes and router`

---

### Task 2: Request guards + CORS

**Files:** Create `api/src/logic/request.ts`, `api/src/logic/cors.ts`; Test `api/src/logic/request.test.ts`, `api/src/logic/cors.test.ts`

**Interfaces:**
- Consumes: `MAX_BODY_BYTES` (`src/shared/constants.ts`), `ApiErrorCode` (Task 1).
- Produces:
  ```ts
  // request.ts
  export function checkContentType(contentType: string | null): ApiErrorCode | null;   // 'unsupported_media_type' unless media type is application/json (case-insensitive, params like ;charset=utf-8 allowed)
  export function checkDeclaredLength(contentLength: string | null): ApiErrorCode | null; // 'payload_too_large' if a valid integer > MAX_BODY_BYTES; null if absent/non-numeric
  export function byteLength(text: string): number;                                    // UTF-8 bytes via TextEncoder
  export type ParsedBody = { ok: true; value: unknown } | { ok: false; error: 'payload_too_large' | 'invalid_json' };
  export function parseBody(text: string): ParsedBody;                                 // size check on actual bytes first, then JSON.parse
  // cors.ts
  export function parseAllowedOrigins(value: string | undefined): string[];            // comma-split, trimmed, empties dropped
  export type OriginDecision = { kind: 'none' } | { kind: 'allowed'; origin: string } | { kind: 'forbidden' };
  export function decideOrigin(origin: string | null, allowed: readonly string[]): OriginDecision; // exact string match
  export function corsHeaders(decision: OriginDecision): Record<string, string>;
  ```
  `corsHeaders`: `none` → `{}`; `forbidden` → `{ Vary: 'Origin' }`; `allowed` → `{ 'Access-Control-Allow-Origin': origin, Vary: 'Origin', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400' }`.

- [ ] **Step 1: Failing tests** — `checkContentType`: `'application/json'`, `'Application/JSON; charset=utf-8'` → null; `null`, `'text/plain'`, `'application/jsonp'`, `'multipart/form-data'` → `'unsupported_media_type'`. `checkDeclaredLength`: `'1024'`/`null`/`'abc'` → null, `'1025'` → `'payload_too_large'`. `byteLength('ș')` = 2. `parseBody`: 1024-byte valid JSON → ok; 1025-byte string (e.g. `'{"a":"' + 'x'.repeat(1017) + '"}'` padded so `byteLength` is exactly 1025) → `payload_too_large` (Review Focus 1); multibyte body whose `.length` ≤ 1024 but bytes > 1024 → `payload_too_large`; `'{oops'` → `invalid_json`; `'null'` → ok with value null. `parseAllowedOrigins(' https://a.dev , ,http://localhost:5173 ')` → two origins; `undefined` → `[]`. `decideOrigin`: null → none; listed → allowed; `'https://evil.dev'` → forbidden; `'https://a.dev/'` (trailing slash) → forbidden. `corsHeaders` exact objects for all three kinds (Review Focus 4).
- [ ] **Step 2: Run to verify fail.** — **Step 3: Implement.** — **Step 4: Run to verify pass** (`npx vitest run api/src/logic`).
- [ ] **Step 5: Stryker** — `--mutate "api/src/logic/request.ts,api/src/logic/cors.ts"` → ≥80%.
- [ ] **Step 6: Commit** — `feat(api): add request guards and CORS decisions`

---

### Task 3: Leaderboard query + rate limit + IP hashing

**Files:** Create `api/src/logic/leaderboard.ts`, `api/src/logic/ratelimit.ts`; Test `api/src/logic/leaderboard.test.ts`, `api/src/logic/ratelimit.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // leaderboard.ts
  export type Board = 'fastest' | 'potholes';
  export const LEADERBOARD_DEFAULT_LIMIT = 20;
  export const LEADERBOARD_MAX_LIMIT = 50;
  export type LeaderboardQuery = { ok: true; board: Board; limit: number } | { ok: false; error: 'invalid_board' | 'invalid_limit' };
  export function parseLeaderboardQuery(params: URLSearchParams): LeaderboardQuery; // board required; limit optional, digits only, 1..50
  export function leaderboardSql(board: Board): string;  // full SELECT with ORDER BY and `LIMIT ?1`
  export interface ScoreRow { nickname: string; time_ms: number; potholes: number; created_at: string }
  export interface LeaderboardEntry { nickname: string; timeMs: number; potholes: number; createdAt: string }
  export function toEntry(row: ScoreRow): LeaderboardEntry;
  // ratelimit.ts
  export const RATE_LIMIT = { windowS: 60, maxPerWindow: 5 } as const;
  export function windowStart(nowMs: number): number;     // epoch seconds floored to the window
  export function isRateLimited(countAfterIncrement: number): boolean; // > maxPerWindow
  export async function hashIp(ip: string, salt: string): Promise<string>; // hex SHA-256 of `${salt}:${ip}`
  ```
  SQL (exact): fastest → `SELECT nickname, time_ms, potholes, created_at FROM scores ORDER BY time_ms ASC, created_at ASC, id ASC LIMIT ?1`; potholes → `SELECT nickname, time_ms, potholes, created_at FROM scores ORDER BY potholes DESC, time_ms ASC, id ASC LIMIT ?1` (Review Focus 2).

- [ ] **Step 1: Failing tests** — query: `board=fastest` → limit 20; `board=potholes&limit=50` → 50; missing board / `board=slowest` → `invalid_board`; `limit=0`, `51`, `-1`, `1.5`, `abc`, `''`, `' 5'` → `invalid_limit`; `limit=1` ok. `leaderboardSql` equals the two exact strings. `toEntry` maps snake to camel. `windowStart(0)=0`, `windowStart(59_999)=0`, `windowStart(60_000)=60`, `windowStart(125_500)=120`. `isRateLimited(5)=false`, `(6)=true`. `hashIp('1.2.3.4','s')` is 64 lowercase hex chars, deterministic, differs for a different salt and a different IP, and does not contain the IP (Review Focus 3 unit part).
- [ ] **Step 2: Run to verify fail.** — **Step 3: Implement** (`crypto.subtle.digest('SHA-256', …)`). — **Step 4: Run to verify pass.**
- [ ] **Step 5: Stryker** — `--mutate "api/src/logic/leaderboard.ts,api/src/logic/ratelimit.ts"` → ≥80%.
- [ ] **Step 6: Commit** — `feat(api): add leaderboard query, rate limit and IP hashing`

---

### Task 4: D1 schema + Worker `POST /scores`

**Files:** Create `api/migrations/0001_init.sql`, `api/test/scores.test.ts`; Modify `api/src/index.ts`

**Interfaces:**
- Consumes: everything from Tasks 1–3; `validateSubmission` from `src/shared/score.ts`.
- Produces: `export default { fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> }` with `interface Env { DB: D1Database; ALLOWED_ORIGINS: string; IP_SALT: string }`. A single `respond(result: ApiResult, cors: Record<string,string>, extra?: Record<string,string>): Response` helper sets `Content-Type: application/json; charset=utf-8` plus CORS headers on every response.

Schema (exact):
```sql
CREATE TABLE scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nickname TEXT NOT NULL,
  time_ms INTEGER NOT NULL,
  potholes INTEGER NOT NULL,
  client_version TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ip_hash TEXT NOT NULL
);
CREATE INDEX idx_scores_fastest ON scores (time_ms ASC, created_at ASC, id ASC);
CREATE INDEX idx_scores_potholes ON scores (potholes DESC, time_ms ASC, id ASC);
CREATE TABLE rate_limits (
  ip_hash TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL,
  PRIMARY KEY (ip_hash, window_start)
);
```

POST flow (in this order): origin decision (forbidden → 403) → content-type (415) → declared length (413) → read text → `parseBody` (413/400) → `validateSubmission` (400 with its code) → rate limit: `INSERT INTO rate_limits (ip_hash, window_start, count) VALUES (?1, ?2, 1) ON CONFLICT(ip_hash, window_start) DO UPDATE SET count = count + 1 RETURNING count`, 429 if limited; prune `DELETE FROM rate_limits WHERE window_start < ?1` (older than 1 h) via `ctx.waitUntil` → insert score → 201 `{ id }`. IP from `CF-Connecting-IP` (fallback `'unknown'`). Whole handler wrapped in try/catch → 500 `internal` (Review Focus 5). Validation runs before rate limiting, so malformed spam doesn't consume a legitimate user's quota; rate limiting runs before the insert.

- [ ] **Step 1: Failing integration tests** (`api/test/scores.test.ts`, using `SELF.fetch` and `env.DB`; allowed origin `http://localhost:5173`):
  - valid submission → 201, body `{ id: <number> }`, row in `scores` with trimmed/NFC nickname and a 64-hex `ip_hash` ≠ the IP; response has `Access-Control-Allow-Origin: http://localhost:5173`.
  - `timeMs: 179999` → 400 `time_too_fast`; extra field → 400 `unknown_field`; `text/plain` → 415; `{oops` → 400 `invalid_json`; 1025-byte body with no `Content-Length` override → 413 (Review Focus 1); `Origin: https://evil.dev` → 403 `forbidden_origin`.
  - no `Origin` header → 201 and no `Access-Control-Allow-Origin` header.
  - `env.DB` replaced by a stub whose `prepare` throws → 500 `{ error: 'internal' }` with JSON content type and CORS headers (Review Focus 5; call `worker.fetch(req, { ...env, DB: throwingStub }, ctx)` directly).
- [ ] **Step 2: Run to verify fail** — `cd api && npm test` → FAIL.
- [ ] **Step 3: Implement** migration and Worker POST path.
- [ ] **Step 4: Verify** — `cd api && npm test && npm run typecheck`; root `npm test`.
- [ ] **Step 5: Commit** — `feat(api): add D1 schema and POST /scores`

---

### Task 5: Worker `GET /leaderboard`, preflight, 404/405, rate-limit integration

**Files:** Modify `api/src/index.ts`; Create `api/test/leaderboard.test.ts`, `api/test/routing.test.ts`

**Interfaces:** Consumes Tasks 1–4. GET responses carry `Cache-Control: public, max-age=30` and are stored in `caches.default` keyed by the full request URL (including query) for 30 s; a cache hit is returned with fresh CORS headers for the current request's origin (CORS headers are never cached). Preflight → 204 with CORS headers for an allowed origin, 403 `forbidden_origin` for a disallowed one, 204 without CORS headers when no Origin.

- [ ] **Step 1: Failing integration tests**
  - leaderboard: seed rows directly via `env.DB`; `board=fastest` returns ascending `timeMs`; `board=potholes` descending `potholes`, ties by `timeMs` asc; two rows with equal `time_ms` come back in insertion order on repeated calls (Review Focus 2); `limit=2` returns 2; `board=nope` → 400 `invalid_board`; `limit=51` → 400 `invalid_limit`; entry shape exactly `{ nickname, timeMs, potholes, createdAt }`; `Cache-Control` header present.
  - cache: a second identical GET after inserting a new faster score within 30 s still returns the cached list (proves caching); a GET with a different `limit` is not served from that cache entry.
  - rate limit: 5 POSTs with `CF-Connecting-IP: 9.9.9.9` → 201 each, 6th → 429 `rate_limited`; a POST from `CF-Connecting-IP: 8.8.8.8` right after → 201 (Review Focus 3). Window rollover is covered by the Task 3 unit tests plus one integration test that pre-seeds `rate_limits` with `count = 5` for an old `window_start` and expects 201.
  - routing: `GET /scores` → 405, `DELETE /leaderboard` → 405, `GET /nope` → 404; `OPTIONS /scores` with allowed origin → 204 + `Access-Control-Allow-Methods`; with `https://evil.dev` → 403; GET from `https://evil.dev` → 200 without `Access-Control-Allow-Origin` (Review Focus 4).
- [ ] **Step 2: Run to verify fail.** — **Step 3: Implement.** — **Step 4: Verify** — `cd api && npm test && npm run typecheck`.
- [ ] **Step 5: Commit** — `feat(api): add GET /leaderboard with edge cache, preflight and routing`

---

### Task 6: CI for the API + full gate

**Files:** Modify `.github/workflows/ci.yml`

Add a second job `api` (ubuntu-latest, Node 24, `cache: npm` with `cache-dependency-path: api/package-lock.json`): `npm ci` in `api/` → `npm run typecheck` → `npm test`. The root `verify` job already runs the `api/src/logic` unit tests and mutation via root configs. Bump `actions/checkout` and `actions/setup-node` to their current major versions (the Node 20 runtime deprecation warning seen on run 42484123408).

- [ ] **Step 1: Full local gate** — root `npm run typecheck && npm test && npx stryker run --force && npm run build`; `cd api && npm run typecheck && npm test`. Expected: all exit 0; Stryker total ≥80% with `api/src/logic` files listed. Kill survivors / document equivalents as in Plan 1.
- [ ] **Step 2: Update ci.yml** as above; validate YAML syntax (`npx --yes yaml-lint .github/workflows/ci.yml` or equivalent).
- [ ] **Step 3: Commit** — `ci: add API job and bump actions`

---

### Task 7: First deploy (human-in-the-loop)

**Files:** Modify `api/wrangler.toml` (real `database_id`); Create `api/README.md` (deploy + local dev steps); Modify spec §5 only if something had to change.

This task needs the human's Cloudflare login and creates billable-tier resources (free plan). The controller asks before each outward step.

- [ ] **Step 1: Human logs in** — human runs `! cd api && npx wrangler login` and confirms the account (`npx wrangler whoami`).
- [ ] **Step 2: Create D1** — `npx wrangler d1 create drumurile-superpowers`; put the returned `database_id` in `wrangler.toml`.
- [ ] **Step 3: Apply migrations remotely** — `npx wrangler d1 migrations apply drumurile-superpowers --remote` → `0001_init.sql` applied.
- [ ] **Step 4: Set secret** — generate 32 random bytes hex locally and `npx wrangler secret put IP_SALT` (value never committed or printed in logs/reports).
- [ ] **Step 5: Deploy** — `npx wrangler deploy` → note the `*.workers.dev` URL.
- [ ] **Step 6: Smoke test the live API** — `curl` `GET /leaderboard?board=fastest` → 200 `{ entries: [] }`; `POST /scores` with a valid body and `Origin: http://localhost:5173` → 201; `GET` again (after 30 s) shows it; `POST` with `timeMs: 1000` → 400 `time_too_fast`; `OPTIONS` from `https://evil.dev` → 403. Then delete the smoke-test row: `npx wrangler d1 execute drumurile-superpowers --remote --command "DELETE FROM scores WHERE nickname = '<smoke nickname>'"`.
- [ ] **Step 7: Document** in `api/README.md`: URLs, how to run locally (`npm run dev`), how to deploy, the GitHub secrets a future deploy workflow would need (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`). (An automated `deploy.yml` is deferred to Plan 3, where the frontend deploy is added and both can share it.)
- [ ] **Step 8: Commit** — `chore(api): deploy to Cloudflare and document`

---

## Next plan
- **Plan 3 – Game client**: `sim`, `render`, `ui`, `adapters` (localStorage adapter must never throw; API client against the URL from Task 7), `main.ts`, Cloudflare Pages deploy + `deploy.yml`, playtest against AC 1–12. Physics must cap speed at `TOP_SPEED_KMH`.
