// myGym fork: the sync gateway (docs/dev/SYNC_SPEED.md). Runs upstream's API unmodified on an inner
// port in this same process and listens on the public one in front of it. Everything passes through
// untouched, streamed, headers and all, except three things:
//   GET /api/config        upstream's answer plus `sync: { gzip, delta }`, what this server accepts
//   PUT /api/data (gzip)   a gzipped push, inflated and handed on as the plain body upstream reads
//   PUT /api/data/delta    a push as the difference from the revision the app last saw (sync-delta.js):
//                          rebuilt into the full document and handed on as an ordinary PUT /api/data
// Upstream still checks the revision when it writes, stamps, and writes the file: this never writes
// a file and never decides a conflict. Switched on by docker-compose.override.yml; without it, the
// container runs `node server.js` as upstream ships it.
import http from 'node:http'
import zlib from 'node:zlib'
import crypto from 'node:crypto'
import { applyDelta, canon } from './sync-delta.js'

const PUBLIC_PORT = +(process.env.PORT || 3000)
const INNER_PORT = process.env.UPSTREAM_PORT ?? '3100'
// A request body as it arrives: the cap nginx and upstream already hold a push to.
const MAX_BODY = 5 * 1024 * 1024
// What one may inflate to. Far above any profile; past it the upload is refused, never inflated.
const MAX_INFLATED = 64 * 1024 * 1024
export const CAPABILITIES = { gzip: true, delta: 1 }

// Upstream's server.js starts its listener when imported and exports nothing; the first server it
// starts listening is the API, and its address is the one to forward to.
let api = null
const listen = http.Server.prototype.listen
http.Server.prototype.listen = function (...args) { if (!api) api = this; return listen.apply(this, args) }
process.env.PORT = String(INNER_PORT)
try { await import('../server.js') } finally { http.Server.prototype.listen = listen }
if (!api) throw new Error('sync-gateway: server.js started no listener')
if (!api.listening) await new Promise(resolve => api.once('listening', resolve))
const apiPort = api.address().port

const sha256 = text => crypto.createHash('sha256').update(text).digest('hex')
const send = (res, status, obj, headers = {}) => {
  if (res.headersSent) return res.destroy()
  const body = JSON.stringify(obj)
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body), ...headers })
  res.end(body)
}

// The request's own headers for a call of ours to upstream with a body we made: the same cookie,
// token, origin and forwarding headers, a body description of our own.
function headersFor(req, body) {
  const h = { ...req.headers }
  for (const k of ['content-length', 'content-encoding', 'transfer-encoding', 'expect']) delete h[k]
  if (body != null) { h['content-type'] = 'application/json'; h['content-length'] = String(Buffer.byteLength(body)) }
  return h
}

// One exchange with upstream, the answer handed on to `res` as it comes.
function pipeTo(req, res, { method = req.method, path = req.url, headers = req.headers, body = null } = {}) {
  return new Promise(resolve => {
    const out = http.request({ host: '127.0.0.1', port: apiPort, method, path, headers }, up => {
      res.writeHead(up.statusCode, up.statusMessage, up.rawHeaders)   // raw pairs keep each Set-Cookie
      up.pipe(res)
      up.on('end', resolve)
      up.on('error', () => { res.destroy(); resolve() })
    })
    out.on('error', () => { send(res, 502, { error: 'api unavailable' }); resolve() })
    res.on('close', () => { if (!res.writableFinished) out.destroy() })
    if (body != null) out.end(body)
    else req.pipe(out)
  })
}

// One exchange with upstream, read whole: { status, rawHeaders, text }.
function call(method, path, headers, body = null) {
  return new Promise((resolve, reject) => {
    const out = http.request({ host: '127.0.0.1', port: apiPort, method, path, headers }, up => {
      const chunks = []
      up.on('data', d => chunks.push(d))
      up.on('end', () => resolve({ status: up.statusCode, rawHeaders: up.rawHeaders, text: Buffer.concat(chunks).toString('utf8') }))
      up.on('error', reject)
    })
    out.on('error', reject)
    out.end(body)
  })
}

class Refusal extends Error { constructor(status, message) { super(message); this.status = status } }

// The body, inflated when it came gzipped. Refused past either cap, and for an encoding we do not read.
function readBody(req) {
  return new Promise((resolve, reject) => {
    const enc = String(req.headers['content-encoding'] || 'identity').toLowerCase()
    if (enc !== 'gzip' && enc !== 'identity') { req.resume(); return reject(new Refusal(415, 'unsupported content encoding')) }
    let size = 0, over = false
    const chunks = []
    req.on('data', d => {
      size += d.length
      if (size > MAX_BODY) { over = true; chunks.length = 0 }
      else if (!over) chunks.push(d)
    })
    req.on('error', reject)
    req.on('end', () => {
      if (over) return reject(new Refusal(413, 'request body too large'))
      const buf = Buffer.concat(chunks)
      if (enc === 'identity') return resolve(buf)
      try { resolve(zlib.gunzipSync(buf, { maxOutputLength: MAX_INFLATED })) }
      catch (e) { reject(e?.code === 'ERR_BUFFER_TOO_LARGE' ? new Refusal(413, 'request body too large') : new Refusal(400, 'invalid gzip body')) }
    })
  })
}

// A raw header list without the ones that describe a body we are about to replace.
const keepHeaders = raw => {
  const out = []
  for (let i = 0; i < raw.length; i += 2) {
    const k = raw[i].toLowerCase()
    if (k !== 'content-length' && k !== 'content-encoding' && k !== 'transfer-encoding') out.push(raw[i], raw[i + 1])
  }
  return out
}

async function config(req, res) {
  const r = await call('GET', req.url, headersFor(req, null))
  let data = null
  try { data = JSON.parse(r.text) } catch { /* not JSON: handed on as it came */ }
  const text = r.status === 200 && data && typeof data === 'object' && !Array.isArray(data) ? JSON.stringify({ ...data, sync: CAPABILITIES }) : r.text
  const headers = keepHeaders(r.rawHeaders)
  headers.push('Content-Length', String(Buffer.byteLength(text)))
  res.writeHead(r.status, headers)
  res.end(text)
}

async function delta(req, res) {
  let body
  try { body = JSON.parse((await readBody(req)).toString('utf8')) } catch (e) {
    if (e instanceof Refusal) return send(res, e.status, { error: e.message })
    return send(res, 400, { error: 'invalid json' })
  }
  if (!body || typeof body !== 'object' || !body.delta || typeof body.delta.hash !== 'string' || typeof body.baseRev !== 'number') {
    return send(res, 400, { error: 'delta and baseRev required' })
  }
  // The document this push is the difference from: upstream's, read with the caller's own session.
  const got = await call('GET', '/api/data', headersFor(req, null))
  if (got.status !== 200) { res.writeHead(got.status, keepHeaders(got.rawHeaders).concat('Content-Length', String(Buffer.byteLength(got.text)))); return res.end(got.text) }
  const { state: stored, rev } = JSON.parse(got.text)
  const cur = stored && typeof stored === 'object' ? stored : {}
  const curRev = rev || 0
  // Another device wrote since: the answer a full push gets, the document along with it.
  if (body.baseRev !== curRev || (typeof body.baseWid === 'string' && cur._wid && body.baseWid !== cur._wid)) {
    return send(res, 409, { error: 'conflict', rev: curRev, state: cur })
  }
  let state
  try { state = applyDelta(cur, body.delta) } catch { return send(res, 409, { error: 'delta-mismatch' }) }
  if (sha256(canon(state)) !== body.delta.hash) return send(res, 409, { error: 'delta-mismatch' })
  const full = JSON.stringify({ state, baseRev: body.baseRev, ...(typeof body.baseWid === 'string' ? { baseWid: body.baseWid } : {}), stamped: body.stamped === true })
  // Upstream checks the revision again as it writes: a device that wrote since our read still
  // gets its 409 from there.
  await pipeTo(req, res, { method: 'PUT', path: '/api/data', headers: headersFor(req, full), body: full })
}

async function gzippedPush(req, res) {
  let buf
  try { buf = await readBody(req) } catch (e) { return send(res, e instanceof Refusal ? e.status : 400, { error: e.message }) }
  const text = buf.toString('utf8')
  await pipeTo(req, res, { headers: headersFor(req, text), body: text })
}

export const gateway = http.createServer(async (req, res) => {
  const path = (req.url || '/').split('?')[0]
  try {
    if (req.method === 'GET' && path === '/api/config') return await config(req, res)
    if (req.method === 'PUT' && path === '/api/data/delta') return await delta(req, res)
    if (req.method === 'PUT' && path === '/api/data' && req.headers['content-encoding']) return await gzippedPush(req, res)
    return await pipeTo(req, res)
  } catch (e) {
    console.error('sync-gateway', req.method, path, e)
    send(res, 502, { error: 'api unavailable' })
  }
})
// As upstream's own listener: uploads of videos take long, a client that never sends headers does not.
gateway.requestTimeout = 30 * 60000
gateway.headersTimeout = 60000
gateway.listen(PUBLIC_PORT, () => console.log(`sync-gateway on :${gateway.address().port} (api on :${apiPort})`))
