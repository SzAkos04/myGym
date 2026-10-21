// myGym fork: the sync transport against a fetch that answers like the server's gateway does
// (api/fork/sync-gateway.js), delta rebuilt and hash checked for real.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { gunzipSync } from 'node:zlib'
import { createHash } from 'node:crypto'
import { applyDelta, canon } from '../../../api/fork/sync-delta.js'
import { api, _resetSyncTransport } from './sync-transport.js'

const sha = t => createHash('sha256').update(t).digest('hex')
const json = (status, obj) => new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json' } })
const workouts = n => Array.from({ length: n }, (_, i) => ({ id: 'w' + i, d: '2026-09-01', entries: [{ id: '0025', sets: [{ w: 60, r: 8, done: true }] }] }))

// A server: one stored document, revision and write id; what each request carried is kept.
function server({ caps = { gzip: true, delta: 1 }, doc = { unit: 'kg', workouts: workouts(50), _ts: 1 } } = {}) {
  const s = { rev: 3, doc: { ...doc, _wid: 'w3' }, calls: [], mismatchNext: false, conflictNext: null }
  const read = init => {
    const enc = init.headers?.['Content-Encoding']
    const raw = enc === 'gzip' ? gunzipSync(Buffer.from(init.body)).toString('utf8') : init.body
    return { gz: enc === 'gzip', bytes: enc === 'gzip' ? init.body.byteLength : raw.length, body: JSON.parse(raw) }
  }
  const land = state => { s.rev += 1; s.doc = { ...state, _wid: 'w' + s.rev }; return json(200, { ok: true, rev: s.rev, wid: 'w' + s.rev }) }
  s.fetch = vi.fn(async (url, init = {}) => {
    const path = String(url).replace(/^.*?(\/api\/)/, '$1')
    const method = init.method || 'GET'
    if (path === '/api/config') return json(200, caps ? { invite_only: false, sync: caps } : { invite_only: false })
    if (path === '/api/data' && method === 'GET') return json(200, { state: s.doc, rev: s.rev })
    const { gz, bytes, body } = read(init)
    s.calls.push({ path, gz, bytes, body })
    if (s.conflictNext) { const c = s.conflictNext; s.conflictNext = null; s.rev = c.rev; s.doc = c.doc; return json(409, { error: 'conflict', rev: s.rev, state: s.doc }) }
    if (body.baseRev != null && body.baseRev !== s.rev) return json(409, { error: 'conflict', rev: s.rev, state: s.doc })
    if (path === '/api/data/delta') {
      if (s.mismatchNext) { s.mismatchNext = false; return json(409, { error: 'delta-mismatch' }) }
      const state = applyDelta(s.doc, body.delta)
      if (sha(canon(state)) !== body.delta.hash) return json(409, { error: 'delta-mismatch' })
      return land(state)
    }
    return land(body.state)
  })
  return s
}

// The store's push, as useStore doPush makes it.
const push = (state, baseRev, baseWid) => api('/api/data', { method: 'PUT', body: JSON.stringify({ state, stamped: true, ...(baseRev != null ? { baseRev } : {}), ...(baseWid ? { baseWid } : {}) }) })
const edited = (doc, i, name) => { const s = JSON.parse(JSON.stringify(doc)); delete s._wid; s.workouts[i] = { ...s.workouts[i], name }; s._ts += 1; return s }

let srv
beforeEach(() => { _resetSyncTransport() })
afterEach(() => { vi.unstubAllGlobals() })
const boot = async opts => { srv = server(opts); vi.stubGlobal('fetch', srv.fetch); await api('/api/config') }

describe('sync transport', () => {
  it('after a pull, a push sends only the changed workout, gzipped, and lands as the full state', async () => {
    await boot()
    const { state, rev } = await api('/api/data')
    const next = edited(state, 7, 'Changed')
    const r = await push(next, rev, state._wid)
    expect(r.rev).toBe(4)
    const call = srv.calls.at(-1)
    expect(call).toMatchObject({ path: '/api/data/delta', gz: true })
    expect(call.body.delta.lists.workouts.put.map(w => w.id)).toEqual(['w7'])
    expect(call.bytes * 5).toBeLessThan(JSON.stringify(next).length)
    expect(canon(srv.doc)).toBe(canon(next))
  })

  it('a push that landed is the base of the next one', async () => {
    await boot()
    const { state, rev } = await api('/api/data')
    const a = edited(state, 1, 'A')
    const r = await push(a, rev, state._wid)
    const b = edited(a, 2, 'B')
    await push(b, r.rev, r.wid)
    expect(srv.calls.map(c => c.path)).toEqual(['/api/data/delta', '/api/data/delta'])
    expect(canon(srv.doc)).toBe(canon(b))
  })

  it('without a known base (just loaded) the push goes whole, gzipped', async () => {
    await boot()
    const next = edited(srv.doc, 0, 'X')
    await push(next, 3, 'w3')
    expect(srv.calls[0]).toMatchObject({ path: '/api/data', gz: true })
    expect(canon(srv.doc)).toBe(canon(next))
  })

  it('a mismatch sends the same push again whole, and the store only sees it land', async () => {
    await boot()
    const { state, rev } = await api('/api/data')
    srv.mismatchNext = true
    const next = edited(state, 3, 'Y')
    const r = await push(next, rev, state._wid)
    expect(r.rev).toBe(4)
    expect(srv.calls.map(c => c.path)).toEqual(['/api/data/delta', '/api/data'])
    expect(canon(srv.doc)).toBe(canon(next))
  })

  it('a conflict comes back as it would without the transport, and its document is the next base', async () => {
    await boot()
    const { state, rev } = await api('/api/data')
    const theirs = edited(state, 4, 'Other device')
    srv.conflictNext = { rev: 9, doc: { ...theirs, _wid: 'w9' } }
    const mine = edited(state, 5, 'Mine')
    const err = await push(mine, rev, state._wid).catch(e => e)
    expect(err).toMatchObject({ status: 409, data: { error: 'conflict', rev: 9 } })
    expect(err.data.state.workouts[4].name).toBe('Other device')
    // The store merges and pushes again over revision 9: a delta against the document it was handed.
    const merged = edited(err.data.state, 5, 'Mine')
    await push(merged, 9, 'w9')
    expect(srv.calls.at(-1).path).toBe('/api/data/delta')
    expect(canon(srv.doc)).toBe(canon(merged))
  })

  it('a server without the gateway gets the plain push it gets today', async () => {
    await boot({ caps: null })
    const { state, rev } = await api('/api/data')
    await push(edited(state, 0, 'Z'), rev, state._wid)
    expect(srv.calls[0]).toMatchObject({ path: '/api/data', gz: false })
  })

  it('an older app\'s owed copy (not stamped) and a forced push (no base) go whole', async () => {
    await boot()
    const { state, rev } = await api('/api/data')
    await api('/api/data', { method: 'PUT', body: JSON.stringify({ state: edited(state, 0, 'L'), stamped: false, baseRev: rev }) })
    await push(edited(srv.doc, 1, 'F'), null)
    expect(srv.calls.map(c => c.path)).toEqual(['/api/data', '/api/data'])
  })

  it('a network failure reaches the store as one, with no status', async () => {
    await boot()
    const { state, rev } = await api('/api/data')
    srv.fetch.mockImplementationOnce(async () => { throw new TypeError('fetch failed') })
    await expect(push(edited(state, 0, 'N'), rev, state._wid)).rejects.toMatchObject({ message: 'fetch failed' })
  })

  it('everything else goes through untouched', async () => {
    await boot()
    srv.fetch.mockImplementationOnce(async () => json(200, { rev: 3 }))
    await expect(api('/api/data/rev')).resolves.toEqual({ rev: 3 })
  })
})
