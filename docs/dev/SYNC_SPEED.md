# Sync speed — smaller uploads, cheaper changes (myGym fork)

Plan for three changes that ship together: **(1)** the phone's own save is batched, **(2)** uploads
are gzip-compressed, **(3)** a push sends only what changed (delta push). It describes what to
build, not a change already made. Owner's go-ahead needed before any code.

The guiding rule: **the stored document, the merge rules and the conflict protocol stay exactly
as they are.** (2) and (3) only change how a document travels; the server rebuilds the full
document and runs it through the same `PUT /api/data` pipeline as today. Anything unexpected
falls back to the full upload that works now.

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

Mac numbers; an iPhone 11 is roughly 3× slower on JS. Every change (`useStore.update`) copies the
whole state as a JSON round trip (`clone`, `store/useStore.js:245`), stamps it (`stampChange`), and
`persist` stringifies it again for `localStorage`. 1.5 s after the last change the whole state is
uploaded, uncompressed (downloads are already gzipped by nginx). After three years every sync
moves over 1 MB over mobile data, and nginx's `client_max_body_size 5m` (and the API's
`MAX_BODY`, 5 MB) is reached after roughly 13 years — every push then fails with 413.

---

## 1. Batched save on the phone

**Goal:** a tap does not pay for writing the state to storage; a burst of taps writes once.

`persist` (`store/useStore.js:574`) keeps everything it does today **except** the
`JSON.stringify(S)` + `localStorage.setItem(KEY, …)` + write id (`WID_KEY`, `WID_OWNER_KEY`) block,
which moves into `saveNow()` and runs:

- after the last change in a burst (idle callback, at most **300 ms** later);
- **at once** on `visibilitychange → hidden`, `pagehide` (the existing `flush()`), before every
  push (`doPush`), before `settle()` (sign-out), before reading the saved copy of another tab
  (`joinSaved`, `syncFromSaved`), and on the phone build before `nativePersist`.

Order and guarantees kept from today:
- `saveMarker(base)` still goes before the copy (a reload never sees a newer base than its copy).
- The multi-tab join still happens: `saveNow` first checks `readWid() !== seenWid` and joins the
  other tab's copy (the code `persist` runs today), then writes.
- Storage full (`storeLag`, the toast) moves into `saveNow` unchanged.
- In memory the change is immediate: the store, the screen and the push see it at once.

**The accepted risk:** a change made less than 300 ms before the browser is killed outright
(not backgrounded: that flushes) is not on the device. The push is 1.5 s behind anyway, so today
such a change is already missing on the server; batching adds the device copy to that window.

**Also measured, decided after:** whether `structuredClone` beats the JSON round trip in WebKit for
`clone` on a 1 MB state. If it is clearly faster it replaces `clone` in `update`; if not, the clone
stays. Copying only the changed path (structural sharing) is out of scope here: it touches every
`update(s => …)` caller.

---

## 2. Compressed uploads

**Goal:** a full upload is about a tenth of its size.

- **Client** (`lib/api.js`): when the server advertises it (below) and `CompressionStream` exists
  (Safari 16.4+), the `PUT` body is gzipped and sent with `Content-Encoding: gzip`. Otherwise it is
  sent as today.
- **Server** (`readBody`, `api/server.js:745`): a body with `Content-Encoding: gzip` is inflated with
  `zlib.gunzipSync(buf, { maxOutputLength: MAX_INFLATED })`; past the limit the answer is 413, as
  for an oversized body today (no zip bomb: inflation stops at the limit). `MAX_INFLATED` is
  64 MB, far above any real profile. Any other `Content-Encoding` is a 415.
- **Capability:** `GET /api/config` gains `sync: { gzip: true, delta: 1 }`. A client only uses what
  the server it talks to lists, so an old cached app against the new server, or the new app against
  an upstream server, keeps working.
- nginx needs no change: it passes request bodies through, and its 5 MB limit now applies to the
  compressed size.

---

## 3. Delta push

**Goal:** a push carries the changed entries, not the profile. Ticking a set sends one workout's
worth, not three years.

### Model: the delta is only a transport

The push stays conditional on `baseRev`/`baseWid` (today's compare-and-swap). If the server's
document is the revision the client read, then *full = base + delta*, so the server can rebuild the
full document from its own copy and hand it to the unchanged pipeline (`stampPut`, `_rev`, `_wid`,
`resetAt`, media bookkeeping, the atomic write). What is stored is byte for byte what a full push
of the same state would store.

### What the client keeps

`baseDoc`: the server's document at `base.rev`, **in memory only**, set when
- a pull adopts or merges a server copy (the document received, `forClient` form);
- a 409 brings the current document along (`e.data.state`);
- a push lands (`baseDoc` = the state that was sent).

After a reload there is no `baseDoc`: the first push is a full one, the ones after it are deltas.
No second copy in storage.

### The delta (`api/sync-delta.js`, one module, imported by the frontend too)

The module is pure and shared: `frontend/src/lib/` imports it from `../../../api/` as tests already
do with `api/password.js`; the web image builds from the repository root, so the import resolves
there.

```
makeDelta(baseDoc, state) → {
  keys:  [...top-level key order of state],          // also says which keys were dropped
  set:   { key: value, ... },                        // top-level values that differ (non-list)
  lists: { workouts: { order: [ids], put: [entries changed or new] }, routines: …, … },
  hash:  sha256(canon(state))
}
applyDelta(doc, delta) → state
```

- A top-level array whose items are all objects with a string `id` is a **list**: only the
  changed/new entries go, plus the order of ids (a few KB for 540 workouts). Any other value is
  compared whole (`JSON.stringify`) and sent whole if it changed.
- **Ignored on both sides** (never in the delta, never in the hash): `active` (the server drops it),
  `_rev`, `_wid`, `_wids` (server-owned), `_unstamped`, `_prior` (stripped by `forClient`).
- `canon(x)` is `JSON.stringify` of the state without the ignored keys, in the state's own key
  order. `applyDelta` rebuilds keys in `delta.keys` order, so the client's and the server's text match.

### The route

`PUT /api/data/delta`, body `{ baseRev, baseWid, delta, stamped }` (gzipped like any push):

1. Session, then the same compare-and-swap as `PUT /api/data`: wrong base → **409 with the
   document**, exactly as today. The client's existing merge-and-retry handles it.
2. `state = applyDelta(forClient(cur), delta)`; `sha256(canon(state)) !== delta.hash` →
   **409 `{ error: 'delta-mismatch' }`** without the document. The client sends the same push
   again as a full `PUT /api/data`.
3. Otherwise the rebuilt `state` goes through the body of today's `PUT /api/data`, extracted into
   one function `writeState(user, body, res)` that both routes call. That extraction is the only
   edit inside upstream's handler (keeps upstream merges small).

### The client (`doPush`)

`delta` when the server lists `sync.delta`, a `baseDoc` exists for exactly this `base`, it is not a
forced push or a backup replace (`forceNext`, `replaceRev`), and no legacy copy is owed
(`stamped` true). Otherwise the full `PUT`, as today. `delta-mismatch` → one full `PUT` right away.
Any other failure behaves as today (owed, retried).

### What stays the same

The file on disk, `GET /api/data`, `/api/data/rev`, the merge (`sync-merge.js`, `sync-stamps.js`),
the MCP server (it reads the files), backups, the 409 conflict flow, multi-tab handling.

---

## 4. Tests

- `api/sync-delta.test.js`: `applyDelta(base, makeDelta(base, s))` equals `s` for edits, inserts,
  deletes, reorders, a dropped key, a non-list value; `canon` ignores the server-owned keys; the hash
  catches a base that differs.
- API route tests: a delta lands and the stored file equals what the full PUT stores; a stale base →
  409 with the document; a wrong base document → 409 `delta-mismatch`; a gzipped body is read; an
  inflation past `MAX_INFLATED` → 413; unknown encoding → 415; `/api/config` lists the capabilities.
- Store tests (`frontend/src/store/`): after a confirmed sync the next push is a delta, after a
  reload a full one; `delta-mismatch` → full push; an old server (no `sync` in config) → full,
  uncompressed. Batched save: a change then `pagehide` is in `localStorage`; two taps inside the
  window write once; another tab's write in the window is joined, not overwritten; storage full
  still toasts and keeps the copy owed.
- The full frontend, api and MCP suites; CI on push as usual.

## 5. Measured after

Same harness, 1 and 3 year profiles: per-tick synchronous ms; bytes per push (full gzipped,
delta gzipped); one sync round on the iPhone 11 Pro Max simulator.

## 6. Order of work

1. `api/sync-delta.js` + its tests (nothing uses it yet).
2. Server: `writeState` extraction, gzip in `readBody`, `/api/config` capabilities, the delta route,
   route tests.
3. Client: gzip + delta in `doPush`, `baseDoc` bookkeeping, store tests.
4. Batched save + the clone measurement, store tests.
5. Measure, simulator check, commit to `dev`. Merge to `custom` and deploy only on the owner's word.
