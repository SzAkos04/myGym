// myGym fork: a push as the difference from the document the server holds (docs/dev/SYNC_SPEED.md).
// Shared by the server's sync gateway (api/fork/sync-gateway.js) and the app's sync transport
// (frontend/src/fork/sync-transport.js), so both sides read and write one format. Pure: no I/O, no
// hashing (the caller hashes canon(): node:crypto on the server, crypto.subtle in the browser).
//
// A delta is only a way to carry a document. Applied to the base it was made from, it gives back the
// exact state, and `canon()` of the two is the same text; the caller compares hashes of that text and
// falls back to sending the whole document when they differ.

// Keys the server owns or drops: never carried, never compared. `active` stays on the device
// (PUT /api/data deletes it); `_rev`, `_wid` and `_wids` are written by the server; `_unstamped` and
// `_prior` are stripped before a document leaves it (server.js forClient).
const SKIP = new Set(['active', '_rev', '_wid', '_wids', '_unstamped', '_prior'])

const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v)

// An array whose items are all objects with a string id, each id once: carried entry by entry.
// Anything else (an empty array, numbers, a list with a duplicate or a missing id) is one value.
function isList(v) {
  if (!Array.isArray(v) || v.length === 0) return false
  const seen = new Set()
  for (const x of v) {
    if (!isObj(x) || typeof x.id !== 'string' || seen.has(x.id)) return false
    seen.add(x.id)
  }
  return true
}

/** The text both sides hash: the state without the skipped keys, in its own key order. */
export function canon(state) {
  const out = {}
  for (const k of Object.keys(state || {})) if (!SKIP.has(k)) out[k] = state[k]
  return JSON.stringify(out)
}

/** What `state` changed from `base`: { keys, set, lists }. */
export function makeDelta(base, state) {
  const b = isObj(base) ? base : {}
  const keys = Object.keys(state).filter(k => !SKIP.has(k))
  const set = {}, lists = {}
  for (const k of keys) {
    const v = state[k], was = b[k]
    if (isList(v) && isList(was)) {
      const before = new Map(was.map(x => [x.id, JSON.stringify(x)]))
      const put = v.filter(x => before.get(x.id) !== JSON.stringify(x))
      lists[k] = { order: v.map(x => x.id), put }
    } else if (!(k in b) || JSON.stringify(v) !== JSON.stringify(was)) {
      set[k] = v
    }
  }
  return { keys, set, lists }
}

/** `base` with `delta` applied. Throws when the delta names an entry neither side has. */
export function applyDelta(base, delta) {
  const b = isObj(base) ? base : {}
  if (!delta || !Array.isArray(delta.keys) || !isObj(delta.set || {}) || !isObj(delta.lists || {})) throw new Error('bad delta')
  const set = delta.set || {}, lists = delta.lists || {}
  const out = {}
  for (const k of delta.keys) {
    if (typeof k !== 'string' || SKIP.has(k)) throw new Error('bad delta')
    if (Object.hasOwn(set, k)) { out[k] = set[k]; continue }
    if (Object.hasOwn(lists, k)) {
      const { order, put } = lists[k] || {}
      if (!Array.isArray(order) || !Array.isArray(put) || !Array.isArray(b[k])) throw new Error('bad delta')
      const byId = new Map(b[k].filter(isObj).map(x => [x.id, x]))
      for (const x of put) if (isObj(x)) byId.set(x.id, x)
      out[k] = order.map(id => {
        if (!byId.has(id)) throw new Error('bad delta')
        return byId.get(id)
      })
      continue
    }
    if (!Object.hasOwn(b, k)) throw new Error('bad delta')
    out[k] = b[k]
  }
  return out
}
