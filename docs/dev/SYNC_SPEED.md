# Sync speed — a fork-owned sync transport (myGym fork)

**Status: built 2026-10-21** (results in §7). Plan for replacing how the app's data travels to the server — **gzip-compressed uploads** and
**delta pushes** (only what changed) — as a layer the fork owns. It was written as the plan and approved
by the owner before any code; the sections below describe what was built.

**The rule this plan is built around: no upstream file is edited.** Everything new lives in files
upstream does not have (`api/fork/`, `frontend/src/fork/`) and is switched on from the two files
the fork already owns (`frontend/vite.config.js`, `docker-compose.override.yml`). Pulling upstream
(`scripts/sync-upstream.sh`) can never conflict with it. Removing the switch puts back exactly what
upstream ships.

---

## 0. Where the time goes today (measured 2026-10-21)

WebKit (`frontend/scripts/webkit-run.swift`, iPhone UA) against generated profiles of the owner's
plan: 4 sessions a week at 85% attendance, weigh-ins three times a week.

| | 1 year: 167 workouts, 2,911 sets | 3 years: 540 workouts, 9,388 sets |
|---|---|---|
| One set tick, synchronous work | 7–8 ms | 7–12 ms |
| — of it JSON stringify + parse | 3–5 ms | 6–10 ms |
| — of it `localStorage.setItem` | ~0 ms | ~1 ms |
| Upload per push (`PUT /api/data`) | **349 KB** | **1,114 KB** |

The upload is what grows: every change, 1.5 s later, sends the whole profile, uncompressed (downloads
are already gzipped by nginx). After three years every sync moves over 1 MB on mobile data, and the
5 MB request limit (nginx `client_max_body_size`, the API's `MAX_BODY`) is reached after roughly 13
years, when every push starts failing with 413.

---

## 1. What changes and what stays

**Replaced in the fork:** how a push travels. The app's sync code still decides *when* to push and
*what* the profile is; a fork transport turns each push into a gzipped delta and a fork gateway on the
server turns it back into the full document.

**Stays exactly as it is, underneath:** the file on disk (`data/state-<id>.json`), the API's write
path (`PUT /api/data`: the revision check, the stamping in `sync-stamps.js`, `_rev`/`_wid`, the
atomic write, media bookkeeping), the merge (`sync-merge.js`), the 409 conflict flow, pulls,
`/api/data/rev`, backups and the MCP server. The gateway hands every rebuilt document to that same
write path, so what is stored is byte for byte what a full push would store, and upstream's fixes to
any of it reach the fork with no porting.

Switching off upstream's *storage itself* (the JSON files, the stamping, the conflict rules) and
writing our own was considered and is not proposed: it would mean owning every one of those rules,
and every upstream change to them would have to be redone by hand, the opposite of "no conflict".

---

## 2. Server: the sync gateway (`api/fork/sync-gateway.js`)

One Node process, two HTTP servers. The gateway sets `PORT` to an internal port (`UPSTREAM_PORT`,
3100), imports `../server.js` (which starts upstream's API there, unmodified), and listens on the
public port 3000 itself. nginx keeps talking to `api:3000` and notices nothing.

Every request is **streamed through untouched**: method, path, all headers (`Cookie`,
`Authorization`, `Origin`, `Sec-Fetch-*`, `X-Forwarded-For` as nginx sent it, so upstream's rate
limiting and origin checks see what they see today) and the body; the answer comes back the same way,
`Set-Cookie` included. Media uploads and downloads stream, nothing is buffered. Only three things are
handled by the gateway:

1. **`GET /api/config`**: upstream's answer, with `sync: { gzip: true, delta: 1 }` added. A client
   only uses what the server it talks to lists.
2. **`Content-Encoding: gzip` on `PUT /api/data`**: the body is inflated
   (`zlib.gunzipSync(buf, { maxOutputLength: 64 MB })`, past it a 413: no zip bomb) and forwarded
   plain. Any other `Content-Encoding` is a 415.
3. **`PUT /api/data/delta`** with `{ baseRev, baseWid, stamped, delta }` (gzipped like any push):
   1. `GET /api/data` from upstream with the request's own cookie or token: the stored document
      and its revision. Not signed in: upstream's 401 goes back as is.
   2. Stored revision is not `baseRev` (or `_wid` is not `baseWid`): the same **409 with the
      document** a full push would get. The app's existing merge-and-retry handles it.
   3. `state = applyDelta(stored, delta)`; `sha256(canon(state)) !== delta.hash` →
      **409 `{ error: 'delta-mismatch' }`**, no document: the client sends the push again in full.
   4. Forwarded as an ordinary `PUT /api/data` `{ state, baseRev, baseWid, stamped }`, and
      upstream's answer goes back as is. **Upstream checks the revision again at write time**, so a
      device writing between steps 1 and 4 still gets its 409: the gateway never writes a file and
      never decides a conflict.

Cost: the delta route reads the document once over loopback (about 10 ms to parse three years'
worth). The rebuilt document still meets upstream's 5 MB `MAX_BODY`, so the ~13-year ceiling stays
on the server side; the phone's upload no longer approaches it.

**Switched on** in `docker-compose.override.yml` (fork-owned):

```yaml
services:
  api:
    command: ["node", "fork/sync-gateway.js"]
    environment:
      - UPSTREAM_PORT=3100
    volumes:
      - ./api/fork:/app/fork:ro
```

The API image copies its files one by one and that Dockerfile is upstream's, so the fork's files come
in as a read-only mount from the server's checkout instead of a Dockerfile edit. Deleting these lines
and redeploying runs upstream's API exactly as it ships. The container health check reaches the
gateway on 3000 and is passed through.

## 3. The delta (`api/fork/sync-delta.js`, shared by server and app)

One pure module; the app imports it from `../../../api/fork/` (tests already import `api/password.js`
that way, and the web image builds from the repository root).

```
makeDelta(base, state) → {
  keys:  [...top-level key order of state],      // also tells which keys were dropped
  set:   { key: value, ... },                    // top-level values that differ (non-list)
  lists: { workouts: { order: [ids], put: [entries changed or new] }, routines: …, … },
  hash:  sha256(canon(state))
}
applyDelta(base, delta) → state
```

- A top-level array whose items are all objects with a string `id` is a **list**: only changed or new
  entries travel, plus the order of ids (a few KB for 540 workouts). Any other value is compared whole
  and sent whole when it changed.
- Never in a delta or a hash: `active` (upstream drops it), `_rev`, `_wid`, `_wids` (server-owned),
  `_unstamped`, `_prior` (upstream strips them on the way out).
- `canon(x)`: `JSON.stringify` of the state without those keys, in the state's key order;
  `applyDelta` rebuilds keys in `delta.keys` order, so both sides produce the same text.

## 4. App: the sync transport (`frontend/src/fork/sync-transport.js`)

A drop-in for `lib/api.js`: it re-exports everything from it and replaces `api()`. A Vite plugin in
`vite.config.js` (build only, like the fork's module stubs) resolves every import of
`src/lib/api.js` to it, except the transport's own import of the original. `useStore.js` and every
other caller are untouched and still call `api()`.

What the new `api()` does, on the web app only (a paired phone shell talks cross-origin, where the
extra header needs a CORS answer upstream does not give; it keeps the plain path):

- **Remembers the server's document** (`base`, in memory only): from a `GET /api/data` answer, from a
  409's document, and after a push lands (the state it sent, with the `rev`/`wid` answered).
- **`PUT /api/data`** from the store: when the server lists `sync.delta`, `base` is the revision the
  push names (`baseRev`, `baseWid`) and `stamped` is true → `PUT /api/data/delta`, gzipped. When
  there is no such `base` (just loaded, a forced push, a backup replace, an older app's owed copy) →
  the full `PUT /api/data`, gzipped if the server lists `sync.gzip`, plain otherwise.
- **`delta-mismatch`** → the same push again in full, at once; the store only sees the final answer.
- Everything else (the answer, a 409 with its document, an error's `status` and `data`) comes back
  in the shape upstream's `api()` gives, so the store's merge, retry and offline handling work
  unchanged.
- Gzip via `CompressionStream` (Safari 16.4+); without it, uncompressed.

## 5. The phone's own save (dropped)

Batching the device's save was the first idea. Measured, the storage write itself is 0–1 ms; what
costs is the JSON copying inside `useStore.update`/`persist`, and that code is upstream's: changing
it means editing an upstream file, against the rule above. Not part of this plan. If it is wanted
later: a build-time patch of the one `clone` line (`useStore.js:245`) to `structuredClone`, only if
it measures clearly faster in WebKit, with the build failing loudly when upstream changes that line.

## 6. Tests

- `api/fork/sync-delta.test.js`: `applyDelta(base, makeDelta(base, s))` equals `s` for edits, inserts,
  deletes, reorders, a dropped key, a non-list value; `canon` skips the server-owned keys; the hash
  catches a different base.
- `api/fork/sync-gateway.test.js`, against the real upstream API started by the gateway on free ports
  with a temporary `DATA_DIR`: passthrough of sign-in, session cookie, `GET /api/data`, `/rev`,
  media upload/download, health; a gzipped full push lands; inflation past the cap → 413; unknown
  encoding → 415; a delta lands and the file equals the one a full push of the same state writes;
  stale base → 409 with document; wrong base document → `delta-mismatch`; a write between the
  gateway's read and its forward → upstream's 409; `/api/config` lists the capabilities.
- `frontend/src/fork/sync-transport.test.js` (fetch mocked): delta after a pull or a landed push; full
  after a reload; full on a forced push; mismatch → full retry; old server (no `sync` in config) →
  plain full; 409 document becomes the base; error shapes unchanged.
- End to end instead of a store test with `lib/api.js` mocked (the transport imports that very
  module): the built app in WebKit against the real gateway and upstream API (§7).
- The full frontend, api and MCP suites; CI on push. Upstream's own suites keep running against the
  untouched upstream code.

## 7. Measured after (2026-10-21)

The built app in WebKit (iPhone UA), its real store and transport, against the gateway running
upstream's API, three set ticks and their pushes per profile. Every push went as a gzipped delta and
landed (200).

| | 1 year | 3 years |
|---|---|---|
| Upload per push, before | 349 KB | 1,114 KB |
| **Upload per push, now** | **2.1 KB** | **5.2 KB** |
| Push round trip on the Mac's loopback, before → now | 25 → 23–33 ms | ~40 → ~58 ms |

The round trip on loopback grew because the gateway reads the stored document before handing the
rebuilt one on; over a phone's uplink the 1 MB that no longer travels is worth seconds. What is left
of the 3-year delta is mostly the order of 540 workout ids. Suites: frontend 5,212, upstream's API
597, MCP 95, `api/fork` 18, all passing.

## 8. Order of work

1. `api/fork/sync-delta.js` + tests.
2. `api/fork/sync-gateway.js` + tests.
3. `frontend/src/fork/sync-transport.js`, the Vite plugin, tests.
4. `docker-compose.override.yml`, `CLAUDE.md` (the gateway and how to switch it off).
5. Measure, simulator check, commit to `dev`. Merge to `custom` and deploy only on the owner's word.
