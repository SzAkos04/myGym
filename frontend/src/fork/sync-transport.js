// myGym fork: the sync transport (docs/dev/SYNC_SPEED.md). Stands in for lib/api.js: everything it
// exports comes from there, except api(), which is the same call with two changes to a push of the
// profile (PUT /api/data), when the server says it takes them (/api/config `sync`, from the gateway
// in api/fork/sync-gateway.js):
//   - it is gzipped;
//   - when this device knows the document the push builds on, only the difference travels
//     (PUT /api/data/delta, api/fork/sync-delta.js). The server rebuilds the full document, checks
//     it against the hash of the one sent here, and stores it through the ordinary PUT /api/data.
// Whatever happens, the store gets the answer, or the error, a full push would have got: its merge,
// retry and offline handling do not know this file exists. vite.config.js (syncTransport) points every
// import of lib/api.js here in the app build; the tests and upstream's own code keep lib/api.js.
import * as upstream from '../lib/api.js'
import { MOBILE } from '../lib/mobile.js'
import { canon, makeDelta } from './sync-delta.js'

export * from '../lib/api.js'

// What the server takes (`{ gzip, delta }`), as its /api/config said; null until then, or for a server
// without the gateway. A paired phone shell talks to its server cross-origin, where the extra header
// would need a CORS answer upstream does not give: it keeps the plain push.
let caps = null
// The document the server holds at `rev` (`wid`), as this device last saw it: read in a pull, sent in
// a push that landed, or handed back with a conflict. In memory only: after a reload the first push
// is a full one.
let base = null

const keep = (rev, doc, wid) => { base = typeof rev === 'number' && doc && typeof doc === 'object' ? { rev, wid: wid ?? doc._wid, doc } : null }

export async function api(path, opts) {
  const p = String(path).split('?')[0]
  const method = String(opts?.method || 'GET').toUpperCase()
  if (p === '/api/config' && method === 'GET') {
    const r = await upstream.api(path, opts)
    caps = !MOBILE && r && r.sync && typeof r.sync === 'object' ? r.sync : null
    return r
  }
  if (p === '/api/data' && method === 'GET') {
    const r = await upstream.api(path, opts)
    keep(r?.rev, r?.state)
    return r
  }
  if (p === '/api/data' && method === 'PUT' && typeof opts?.body === 'string') return push(path, opts)
  return upstream.api(path, opts)
}

async function push(path, opts) {
  let body
  try { body = JSON.parse(opts.body) } catch { return upstream.api(path, opts) }
  const state = body?.state
  try {
    if (deltaFits(body)) {
      try {
        const delta = { ...makeDelta(base.doc, state), hash: await sha256(canon(state)) }
        const text = JSON.stringify({ baseRev: body.baseRev, ...(typeof body.baseWid === 'string' ? { baseWid: body.baseWid } : {}), stamped: true, delta })
        return landed(await send('/api/data/delta', opts, text), state)
      } catch (e) {
        // The server rebuilt something other than this state: the same push, whole, at once.
        if (!(e?.status === 409 && e.data?.error === 'delta-mismatch')) throw e
      }
    }
    return landed(await send(path, opts, opts.body), state)
  } catch (e) {
    // A conflict brings the server's document along: the store merges into it and pushes again,
    // and that push builds on this document.
    if (e?.status === 409 && e.data?.state) keep(e.data.rev, e.data.state)
    throw e
  }
}

function landed(r, state) {
  keep(r?.rev, state, r?.wid)
  return r
}

// A delta needs the server to take one, the document this push names as its base, and a client that
// stamps its own changes (an older app's owed copy goes whole, for the server to stamp).
function deltaFits(body) {
  return !!(caps?.delta === 1 && base && body && body.stamped === true && typeof body.baseRev === 'number' &&
    body.baseRev === base.rev && (typeof body.baseWid !== 'string' || !base.wid || body.baseWid === base.wid) &&
    body.state && typeof body.state === 'object' && globalThis.crypto?.subtle)
}

async function send(path, opts, text) {
  if (caps?.gzip && typeof CompressionStream === 'function') {
    const gz = await new Response(new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer()
    return upstream.api(path, { ...opts, body: new Uint8Array(gz), headers: { ...(opts.headers || {}), 'Content-Encoding': 'gzip' } })
  }
  return upstream.api(path, { ...opts, body: text })
}

async function sha256(text) {
  const d = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('')
}

// Tests only: forget what this module learned.
export function _resetSyncTransport() { caps = null; base = null }
