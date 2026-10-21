// myGym fork: the sync gateway in front of upstream's real API (both in one child process, as in the
// container), against a temporary data directory.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import zlib from 'node:zlib'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { canon, makeDelta } from './sync-delta.js'

const FORK = path.dirname(fileURLToPath(import.meta.url))
const SECRET = crypto.randomBytes(32).toString('hex')
const UID = 'u_gw_1'
const session = () => {
  const payload = `${UID}:${Date.now() + 86400000}:0`
  return payload + '.' + crypto.createHmac('sha256', SECRET).update(payload).digest('base64url')
}
const auth = (extra = {}) => ({ Cookie: `gymsid=${session()}`, 'Content-Type': 'application/json', ...extra })
const sha256 = t => crypto.createHash('sha256').update(t).digest('hex')

let base, dataDir, child
test.after(() => { child?.kill('SIGKILL'); if (dataDir) fs.rmSync(dataDir, { recursive: true, force: true }) })
test.before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gym-gw-'))
  fs.writeFileSync(path.join(dataDir, 'secret'), SECRET, { mode: 0o600 })
  fs.writeFileSync(path.join(dataDir, 'db.json'), JSON.stringify({ users: [{ id: UID, name: 'One', created: new Date().toISOString() }], creds: [], subs: [], invites: [] }))
  child = spawn(process.execPath, ['sync-gateway.js'], {
    cwd: FORK, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: '0', UPSTREAM_PORT: '0', DATA_DIR: dataDir, ORIGIN: 'http://localhost:8080', RP_ID: 'localhost' },
  })
  let log = ''
  child.stdout.on('data', d => { log += d })
  child.stderr.on('data', d => { log += d })
  const port = await new Promise((resolve, reject) => {
    const give = setTimeout(() => reject(new Error('gateway never started:\n' + log)), 20000)
    child.stdout.on('data', () => { const m = /sync-gateway on :(\d+)/.exec(log); if (m) { clearTimeout(give); resolve(+m[1]) } })
    child.once('exit', c => { clearTimeout(give); reject(new Error(`gateway exited (${c}):\n${log}`)) })
  })
  base = `http://127.0.0.1:${port}`
})

const get = async () => (await fetch(base + '/api/data', { headers: auth() })).json()
const put = (body, extra = {}, url = '/api/data') => fetch(base + url, { method: 'PUT', headers: auth(extra), body })
const profile = (n, tag = '') => ({
  unit: 'kg', weekStart: 1, routines: [{ id: 'r1', name: 'Upper A', ex: [] }],
  workouts: Array.from({ length: n }, (_, i) => ({ id: 'w' + i, d: '2026-09-' + String(1 + (i % 28)).padStart(2, '0'), name: 'Upper A' + tag, entries: [{ id: '0025', sets: [{ w: 60, r: 8, done: true }] }] })),
  bodyweight: [], _ts: Date.now(),
})
// A full push that lands, the way the app makes one; returns the document as the server holds it.
async function seed(state) {
  const cur = await get()
  const r = await put(JSON.stringify({ state, baseRev: cur.rev, stamped: true }))
  assert.equal(r.status, 200, await r.clone().text())
  return get()
}
const deltaBody = (from, to, rev, extra = {}) => JSON.stringify({ baseRev: rev, stamped: true, delta: { ...makeDelta(from, to), hash: sha256(canon(to)) }, ...extra })

test('everything else passes through: health, sign-in state, revision, refusals', async () => {
  assert.equal((await fetch(base + '/api/health')).status, 200)
  assert.equal((await fetch(base + '/api/data')).status, 401)
  const doc = await get()
  assert.equal(typeof doc.rev, 'number')
  const rev = await (await fetch(base + '/api/data/rev', { headers: auth() })).json()
  assert.equal(rev.rev, doc.rev)
})

test('/api/config says what this server accepts, beside what upstream says', async () => {
  const c = await (await fetch(base + '/api/config')).json()
  assert.deepEqual(c.sync, { gzip: true, delta: 1 })
  assert.ok(Object.keys(c).length > 1)
})

test('a plain push and a gzipped one store the same document', async () => {
  const s = profile(5)
  const plain = await seed(s)
  const s2 = { ...profile(5, ' (gz)'), _ts: Date.now() + 1 }
  const r = await put(zlib.gzipSync(JSON.stringify({ state: s2, baseRev: plain.rev, stamped: true })), { 'Content-Encoding': 'gzip' })
  assert.equal(r.status, 200, await r.clone().text())
  const after = await get()
  assert.equal(after.rev, plain.rev + 1)
  assert.equal(canon(after.state), canon(s2))
})

test('an upload that inflates past the cap is refused, an unknown encoding too', async () => {
  const bomb = zlib.gzipSync(Buffer.alloc(70 * 1024 * 1024, 32))
  assert.equal((await put(bomb, { 'Content-Encoding': 'gzip' })).status, 413)
  assert.equal((await put('{}', { 'Content-Encoding': 'br' })).status, 415)
  assert.equal((await put(Buffer.from('not gzip'), { 'Content-Encoding': 'gzip' })).status, 400)
})

test('a delta lands as the full push would, and carries a fraction of it', async () => {
  const cur = await seed(profile(120))
  const next = JSON.parse(JSON.stringify(cur.state)); next.workouts[119].name = 'Changed'; next._ts = Date.now() + 5
  const body = deltaBody(cur.state, next, cur.rev)
  assert.ok(body.length * 10 < JSON.stringify(next).length)
  const r = await put(zlib.gzipSync(body), { 'Content-Encoding': 'gzip' }, '/api/data/delta')
  assert.equal(r.status, 200, await r.clone().text())
  const answer = await r.json()
  assert.equal(answer.rev, cur.rev + 1)
  const after = await get()
  assert.equal(canon(after.state), canon(next))
})

test('a delta over an older revision gets the conflict and the document, like a full push', async () => {
  const cur = await seed(profile(3))
  const next = JSON.parse(JSON.stringify(cur.state)); next.unit = 'lb'
  const r = await put(deltaBody(cur.state, next, cur.rev - 1), {}, '/api/data/delta')
  assert.equal(r.status, 409)
  const body = await r.json()
  assert.equal(body.error, 'conflict')
  assert.equal(body.rev, cur.rev)
  assert.equal(canon(body.state), canon(cur.state))
})

test('a delta made from a different document is a mismatch, and nothing is written', async () => {
  const cur = await seed(profile(4))
  const wrongBase = JSON.parse(JSON.stringify(cur.state)); wrongBase.workouts[0].name = 'Not what the server has'
  const next = JSON.parse(JSON.stringify(wrongBase)); next.unit = 'lb'
  const r = await put(deltaBody(wrongBase, next, cur.rev), {}, '/api/data/delta')
  assert.equal(r.status, 409)
  assert.equal((await r.json()).error, 'delta-mismatch')
  assert.equal((await get()).rev, cur.rev)
})

test('two devices pushing over the same revision: one lands, the other gets a conflict', async () => {
  const cur = await seed(profile(6))
  const a = JSON.parse(JSON.stringify(cur.state)); a.workouts[0].name = 'Device A'
  const b = JSON.parse(JSON.stringify(cur.state)); b.workouts[1].name = 'Device B'
  const [ra, rb] = await Promise.all([put(deltaBody(cur.state, a, cur.rev), {}, '/api/data/delta'), put(deltaBody(cur.state, b, cur.rev), {}, '/api/data/delta')])
  assert.deepEqual([ra.status, rb.status].sort(), [200, 409])
  const after = await get()
  assert.equal(after.rev, cur.rev + 1)
  assert.equal(canon(after.state), canon(ra.status === 200 ? a : b))
})

test('a delta without a session is refused by upstream, as it would be', async () => {
  const r = await fetch(base + '/api/data/delta', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: deltaBody({}, profile(1), 0) })
  assert.equal(r.status, 401)
})
