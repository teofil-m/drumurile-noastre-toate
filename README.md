# drumurile-noastre-toate
Drumurile noastre toate, se vor mai construi vreodata?

Acesta este un joc in browser care va fi initial deployat pe github pages al acestui proiect, iar ulterior vom construi
on top si vom deploya in cloudflare(kudos Ionut 🦖 pentru pontul de free plan).

Ideea e simpla: ceva masini, ceva fizica wonky / wobbly de dat in gropi - gropi pe strazi de diferite tipuri si adancimi
cu denumiri amuzante si achievements to be unlocked la fiecare lovire de groapa (gen Gropality, Moartea planetarelor).
Apoi borduri de diferite marimi pe care mai urci din greseala la cat de subrezita iti este directia, guri de canal si 
altele.


## Leaderboard API (superpowers branch)

Live: https://drumurile-api-superpowers.mititelu-teofil.workers.dev

- `GET /leaderboard?board=fastest|potholes&limit=20`
- `POST /scores` with JSON `{ nickname, timeMs, potholes, clientVersion }`

Local dev: create `api/.dev.vars` with `IP_SALT=dev-salt`, then
`npx wrangler d1 migrations apply drumurile-superpowers --local --config api/wrangler.toml` and `npm run api:dev`.

Deploy: `npx wrangler deploy --config api/wrangler.toml` (Worker `drumurile-api-superpowers`, D1 `drumurile-superpowers`;
schema changes: add a file in `api/migrations/` and run `npx wrangler d1 migrations apply drumurile-superpowers --remote --config api/wrangler.toml`).

## Play (superpowers branch)

**https://drumurile-superpowers.mititelu-teofil.workers.dev** — WASD/arrows drive, Space handbrake, R restart, Esc pause.

Deploy the game: `npm run deploy:web` (builds with Vite and deploys `dist/` as an assets-only Worker `drumurile-superpowers`, config in `wrangler.jsonc`).
Cloudflare now routes new Pages projects to Workers, so the game is hosted as Workers static assets instead of `*.pages.dev`.
