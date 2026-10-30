# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

openGym is a self-hosted gym & body-weight tracker PWA. Two containers (`api` + `web`) plus a
`./data` folder the user owns — no third-party account, no telemetry. Passkey (WebAuthn) login,
installable as a home-screen app, optional Capacitor shells for standalone Android/iOS builds.
License: AGPL-3.0-or-later.

## Project layout

```
frontend/  React 19 + Vite app (src/views, src/components, src/store, src/lib). Builds to static files.
           android/ + ios/ are the Capacitor shells for the standalone mobile app (docs/MOBILE.md).
api/       backend — server.js (Node, no framework), deps: @simplewebauthn/server, web-push.
           coach/ is the optional AI coach; openapi.yaml documents every route.
web/       multi-stage Dockerfile (builds frontend → nginx) + nginx.conf.template (serves app, proxies /api).
mcp/       optional MCP server — read-only stdio bridge exposing a user's workouts/1RM/muscle
           balance to LLM clients (Claude Desktop, Cursor…). Not part of the Docker build; only
           runs when an LLM client spawns it.
media/     exercise img/gif, gitignored, fetched at runtime by the `media` compose service.
website/   static project site (plain HTML/CSS/JS), deployed separately.
kubernetes/ example manifests (docs/SELF_HOSTING_KUBERNETES.md).
docs/      guides indexed in docs/README.md (FAQ, SELF_HOSTING*, MOBILE, AI_COACH, DATA_IMPORTS, API);
           docs/dev/ holds feature design notes (SET_TYPES: drop sets/rest-pause, LIST_VIEW, COMBINE_ROUTINES).
```

## Commands

```bash
# Local stack (api + web + media, prebuilt or built from source)
cp .env.example .env
docker compose up -d --build

# Frontend dev server (hot reload), proxies /api to :3000
cd frontend && npm install && npm run dev

# Frontend tests (training logic: progression, 1RM, session read-back)
cd frontend && npm test            # vitest run
cd frontend && npm run test:watch
npx vitest run src/lib/progression.test.js   # single file
npx vitest run -t "some test name"           # single test by name

# API and MCP server tests
cd api && npm test
cd mcp && npm test

# Production build
cd frontend && npm run build
cd frontend && npm run build:mobile   # + cap sync, points media at the CDN dataset
```

There is no linter/formatter configured (no ESLint/Prettier config in the repo) and no
TypeScript — match the existing style by hand.

GitHub (`github.com/DuarteSantos8/openGym`) is the home of the project; `.github/workflows/mirror.yml`
pushes `main` and `v*` tags to the GitLab mirror. Pull requests are gated by
`.github/workflows/test.yml` on Node 22 — the same version as `web/Dockerfile` / `api/Dockerfile`
(`node:22-alpine`): the frontend, api and MCP suites, the locale checks, and building and booting
both api image targets. GitLab CI on the mirror (`.gitlab-ci.yml`) builds the release artifacts:
the signed Android APK, the multi-arch images and the SBOMs. Never push or merge on GitLab
directly; the mirror is fast-forward only.

## Architecture

### Frontend (`frontend/src`)

- **`store/useStore.js`** — single Zustand store holding the entire client-side app state (`S`),
  persisted to `localStorage` (`gym_state_v1`) and debounce-pushed to the server when signed in
  (`pushState`, see `lib/api.js`). On the Capacitor mobile build it's also mirrored to a file via
  `lib/mobile.js` (`nativeSave`), since WebView storage can be evicted. `store/useUI.js` holds
  ephemeral UI state (modals, active sheet, etc.) separately from persisted data.
- **`lib/`** — pure, framework-free helpers, each paired with a same-directory `*.test.js`. This
  is where the domain logic lives, most importantly:
  - `progression.js` — the progression-rule engine (linear, Greyskull LP, double progression,
    time-based). Rules implement a shared policy interface; adding a new one plugs in here.
  - `onerm.js` — estimated 1RM from logged sets.
  - `finish-workout.js` — reduces a completed session back into state (weights advance, PRs, etc).
  - `recovery.js` / `recovery-view.js` — fatigue/muscle-recovery model.
  - `workout-model.js`, `supersetFlow.js` — in-session workout state machine, incl. supersets.
  - `exercises.js` / `exercises-data.js` — the exercise library (1,324 built-ins + user-defined).
  - `api.js` — the only place that talks to the backend (`fetch` wrapper, session cookie flows).
  - CONTRIBUTING.md is explicit: **anything that decides what you lift next, or reads a logged
    session back, is a pure helper here with a unit test beside it** — not verifiable by
    clicking, and the progression engine has already had two bugs that only a test caught.
- **`views/`** — one file per screen (Home, Workout, Plan, Library, Stats, History, Settings,
  Admin, Login, RoutineEdit), routed by `react-router-dom` from `App.jsx`.
- **`components/`** — shared UI (charts, modals, timers); `instr/` holds per-language exercise
  instruction text; `locales/` is the i18n string catalogue (`lib/i18n.js` / `i18n-core.js`).
- Mobile: `@capacitor/*` wraps the same web build into native shells under `frontend/android` and
  `frontend/ios` (see `docs/MOBILE.md`); `mobile.js` in `lib/` gates native-only behavior (file
  persistence, local notifications, wake lock) behind a `MOBILE` flag.

### API (`api/server.js`)

Single file, no framework, plain `node:http`. Requests are dispatched through a `routes` object
keyed by `'METHOD /path'` (e.g. `routes['GET /api/health']`) matched against `req.method + ' ' +
url.pathname` — add a new endpoint by adding a key here. State is two flat JSON files under
`DATA_DIR` (`db.json`: users/credentials/subscriptions/invites; `state-<uid>.json`: per-user
workout data), written with a write-temp-then-rename atomic pattern (`atomicWrite`). Auth is
WebAuthn passkeys (`@simplewebauthn/server`) plus a signed session cookie (HMAC'd with a
`DATA_DIR/secret` generated on first boot) — no JWT/session-store dependency. Optional pieces
gated by env vars: `ADMIN_UIDS` (admin dashboard), `INVITE_ONLY` (signup needs a code),
`ALLOW_GUEST` (client-only guest mode never hits the server at all), plus a rotating
`data/audit.log` (JSONL) for sign-in/admin events. Web Push (`web-push`, VAPID keys
auto-generated into `data/vapid.json`) drives rest-timer-over and day-reminder notifications.

### MCP server (`mcp/src`)

Read-only stdio MCP bridge (`@modelcontextprotocol/sdk`) that lets an LLM client read a single
user's routines/workouts/body-weight/1RM/muscle-balance directly from the same `DATA_DIR` the API
writes to — no network call, no extra container. `state.js` loads/derives the data, `tools.js`
defines the exposed MCP tools (zod-validated schemas), `labels.js` maps internal keys to
human-readable labels, `index.js` wires it together. See `mcp/README.md` for the client-config
side (Claude Desktop / Cursor).

### Passkeys and self-hosting constraints

WebAuthn passkeys are bound to an exact hostname (`RP_ID`) and require HTTPS (localhost excepted)
— this shapes a lot of the API and Settings code (`RP_ID`/`ORIGIN` env vars, guest-mode fallback
when neither is available). Read `docs/SELF_HOSTING.md` before touching auth, session, or
notification code; it documents the exact env-var contract (`RP_ID`, `ORIGIN`, `PORT`,
`WEB_PORT`, `NGINX_PORT`, `BACKEND`, `SESSION_DAYS`, `ADMIN_UIDS`, `INVITE_ONLY`, `ALLOW_GUEST`,
`AUDIT_*`, `VAPID_SUBJECT`) that real deployments depend on.

### Docker / deploy

`docker-compose.yml` has three services: `media` (one-shot exercise-asset downloader, gitignored
output), `api`, `web` (multi-stage build of `frontend/` served by nginx, which also proxies
`/api` → `api` and serves the shared media volume — single origin, required for passkeys).
`web/nginx.conf.template` is rendered from env vars at container start (`NGINX_PORT`, `BACKEND`,
`PORT`), so host/port remapping works against prebuilt images without a rebuild.

## Guidelines from CONTRIBUTING.md worth knowing before changing code

- **Dependency-light is a hard constraint, not a preference.** Frontend: React + Router + Zustand
  and nothing else. `api/`: two dependencies total. New dependencies are a hard sell either side.
- Don't commit `media/` or `data/` (gitignored).
- Training-logic changes (progression, 1RM, session read-back) need a unit test in `src/lib`
  beside the code, not just manual clicking-through.

## This fork (myGym): machines, branches, how work moves

This checkout is the myGym fork (`github.com/SzAkos04/myGym`, default branch for work: `custom`;
`main` mirrors upstream openGym, `scripts/sync-upstream.sh` merges upstream into `custom`).

- **Dev machine: the Mac** (`~/Projects/myGym`). All coding, tests and previews happen here, on
  the **`dev` branch**. Commit and push to `dev` as you go.
- **Server: the Arch Linux box** (`csodabogar2`, moved off Windows on 2026-10-21). It only runs
  Docker from `~/myGym` (user `szakos`) on the **`custom`** branch. Nobody codes there and it is
  slow; don't run tests there.
- **Merging `dev` into `custom` happens only when the user says they tried it and it is good.**
  Never on your own. Then: `git switch custom && git merge dev && git push && git switch dev`.
- **Updating the server** after a merge (from the Mac):
  `ssh szakos@csodabogar2 '~/myGym/scripts/server-update.sh'`. The script pulls `custom`
  (fast-forward only) and rebuilds with the commit as `APP_BUILD` (passed by
  `docker-compose.override.yml`), so Settings shows which build is live ("v1.4.1+<commit>").
  Frontend-only changes need only the `web` service rebuilt; a change in `api/` needs `api` too.
  The web container's health check first runs 5 minutes after start ("health: starting" until then).
- **SSH to the server is Tailscale SSH** (`tailscale up --ssh` on the box): no sshd and no keys.
  The tailnet policy's `ssh` rule must be `"action": "accept"`; with `"check"` every session waits
  for a browser approval and a command run from here just hangs. The box's address is its MagicDNS
  name `csodabogar2.tailbd3336.ts.net`, which is also `RP_ID`: the passkeys are bound to it, so the
  machine must keep exactly that Tailscale name.
  **Ports (set 2026-10-30, after Uptime Kuma took the plain address).** One Tailscale name, one HTTPS
  port per app, each proxied to a local port on 127.0.0.1 (set with `sudo tailscale serve --bg --https=<port>
  http://127.0.0.1:<local>`; changing it needs the sudo password, or `sudo tailscale set --operator=$USER` once):

  | Address (`https://csodabogar2.tailbd3336.ts.net`) | App | Local port |
  |---|---|---|
  | (no port) | Uptime Kuma | 8080 |
  | `:8081` | **myGym** | 8081 (`WEB_PORT` in `~/myGym/.env`) |
  | `:8443` | mySleep | 8083 (`WEB_PORT` in `~/mySleep/.env`) |
  | `:10000` | Vaultwarden | 8082 |

  myGym's `ORIGIN` is `https://csodabogar2.tailbd3336.ts.net:8081` (`~/myGym/.env`, not in git): the API only
  accepts sign-ins and saves from that exact address; `RP_ID` stays the bare hostname, so passkeys are unaffected.
  The home-screen app must be added from the :8081 address. Check the table before giving any new app a port.
  `data/` (users, passkeys, workouts, `secret`, `vapid.json`) is the only state; back it up before
  touching the box.
- **Sync gateway (fork-owned, docs/dev/SYNC_SPEED.md).** The api container runs
  `api/fork/sync-gateway.js` (set in `docker-compose.override.yml`, the fork's files mounted
  read-only): upstream's `server.js` runs unmodified inside it on 3100, the gateway listens on 3000
  and takes gzipped pushes and delta pushes (`PUT /api/data/delta`), rebuilding the full document and
  handing it to upstream's `PUT /api/data`. The app side is `frontend/src/fork/sync-transport.js`,
  swapped in for `src/lib/api.js` by the `syncTransport` plugin in `vite.config.js` (not under
  test). No upstream file is edited for any of it. Its tests: `node --test api/fork/*.test.js`
  (outside upstream's test glob; CI runs them) and `frontend/src/fork/`. To switch it off, remove the
  `api:` block from the override and redeploy.

- **Dozzle fork (log viewer, `github.com/SzAkos04/dozzle`, branch `custom`, built on the box in `~/dozzle-src`).**
  Dozzle's own Update button pulls upstream's image and once replaced myGym's fork build with it, so
  containers labelled `dev.dozzle.update.script: mygym` (set in `docker-compose.override.yml`) are updated
  by running `scripts/server-update.sh` through `~/update-runner` (systemd user service on 172.17.0.1:8085,
  allowlist and token in `~/.config/update-runner/`). Output lands in Dozzle's log. Update the fork itself
  over ssh: `~/dozzle-src/runner/server-update.sh`. Never use Dozzle's update on a container without that label.

### Tests on the Mac

`cd frontend && npm run test:changed -- origin/custom` runs only the tests the branch can affect
(a couple of minutes); `npm run test:watch` reruns on save; one file:
`npx vitest run src/views/Workout.test.jsx -t "name"`. Use Node 22 (Homebrew `node@22`), the
version CI and the Docker images use. `node scripts/check-locales.mjs` before merging when strings
changed: new UI strings may stay English-only (no pack entry) — a key in some packs but not
others fails that check.

### Running it on the Mac, signed in

Passkeys are bound to the hostname (`RP_ID`). The live server is
`https://csodabogar2.tailbd3336.ts.net` (Tailscale serve → `:8080`), so a passkey from there does
not work on `localhost`. Develop against a local API with its own test data instead:

    cd api && DATA_DIR=../data ORIGIN=http://localhost:5173 npm start      # terminal 1
    cd frontend && API_ORIGIN=http://localhost:5173 npm run dev              # terminal 2

Create a test profile on `http://localhost:5173`; it lives only in the Mac's `data/`.
A browser that cannot use a passkey (Claude's browser pane) is signed in with a cookie minted from
`data/secret`: `cd api && DATA_DIR=../data node scripts/dev-session.mjs <id>` (no id lists the
profiles), then `document.cookie = '<printed line>; path=/'` on the localhost page and reload. The
profile with workout data is the one with a `data/state-<id>.json`.

iPhone checks in the iOS Simulator (Xcode set up; an "iPhone 11 Pro Max test" device exists, the
user's phone): serve the production build with a session, `cd frontend && npm run build &&
DEV_SESSION=<value from dev-session.mjs, without gymsid=> API_ORIGIN=http://localhost:4173 npx vite preview --port 4173`,
then open `http://localhost:4173/` in the Simulator's Safari and Share → Add to Home Screen ("Open as
Web App"): that home-screen app is the code path the phone runs. DEV_SESSION signs every cookie-less
request in (dev and preview servers only, never a build); `/__dev-session?c=<value>` does it for one
browser. Record with `xcrun simctl io <udid> recordVideo --codec h264 out.mp4` and read the frames.

Safari-only bugs: the browser pane is Chromium, and Safari's WebDriver (`safaridriver`) hangs on
this Mac even with remote automation allowed. `frontend/scripts/webkit-run.swift` runs the page in
WebKit instead: `swift frontend/scripts/webkit-run.swift 'http://localhost:5173/#/home'
"$(cd api && DATA_DIR=../data node scripts/dev-session.mjs <id>)" flow.js`, where `flow.js` is an
async function body that clicks, waits and returns what it saw (e.g. wrap
`document.startViewTransition` to log each screen transition). It opens a window, so run it
outside the sandbox. Real data:
export a backup from the live app (Settings) and import it into the test profile. Phone layout:
Safari → Develop → Enter Responsive Design Mode (Option-Cmd-R).
