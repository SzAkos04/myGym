// myGym fork: the delta format shared by the sync gateway and the app's transport.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { applyDelta, canon, makeDelta } from './sync-delta.js'

const w = (id, sets = 3, extra = {}) => ({ id, d: '2026-10-0' + (id.length % 9 + 1), entries: [{ id: '0025', sets: Array.from({ length: sets }, () => ({ w: 60, r: 8, done: true })) }], ...extra })
const base = () => ({
  unit: 'kg', _ts: 100, _rev: 7, _wid: 'abc', _wids: ['x'],
  routines: [{ id: 'r1', name: 'Upper A', ex: [] }, { id: 'r2', name: 'Lower A', ex: [] }],
  workouts: [w('w1'), w('w2'), w('w3')],
  bodyweight: [{ d: '2026-10-01', w: 84 }],
  week: { 1: ['r1'] }, dayPlan: {}, deleted: {},
})
const roundTrip = (b, s) => {
  const d = makeDelta(b, s)
  const back = applyDelta(b, JSON.parse(JSON.stringify(d)))   // as it travels
  assert.equal(canon(back), canon(s))
  return d
}

test('an unchanged state carries no entries and no values', () => {
  const d = roundTrip(base(), base())
  assert.deepEqual(d.set, {})
  assert.deepEqual(d.lists.workouts.put, [])
})

test('a ticked set carries one workout, not the history', () => {
  const s = base(); s._ts = 200
  s.workouts[1] = w('w2', 4)
  const d = roundTrip(base(), s)
  assert.deepEqual(d.lists.workouts.put.map(x => x.id), ['w2'])
  assert.deepEqual(d.lists.routines.put, [])
  assert.deepEqual(Object.keys(d.set), ['_ts'])
})

test('new, removed and reordered entries come back in the new order', () => {
  const s = base()
  s.workouts = [w('w3'), w('w4'), w('w1')]          // w2 gone, w4 new, order changed
  const d = roundTrip(base(), s)
  assert.deepEqual(d.lists.workouts.order, ['w3', 'w4', 'w1'])
  assert.deepEqual(d.lists.workouts.put.map(x => x.id), ['w4'])
})

test('changed and dropped settings, and lists that are not entry lists, travel whole', () => {
  const s = base()
  s.unit = 'lb'
  s.week = { 1: ['r1'], 4: ['r2'] }
  delete s.dayPlan
  s.bodyweight.push({ d: '2026-10-03', w: 83.6 })   // no ids: one value
  s.newKey = { a: 1 }
  const d = roundTrip(base(), s)
  assert.deepEqual(Object.keys(d.set).sort(), ['bodyweight', 'newKey', 'unit', 'week'])
  assert.ok(!d.keys.includes('dayPlan'))
})

test('server-owned keys and the running workout are neither carried nor compared', () => {
  const s = base(); s.active = { id: 'a', entries: [] }; s._rev = 9; s._wid = 'zzz'
  const d = roundTrip(base(), s)
  for (const k of ['active', '_rev', '_wid', '_wids']) {
    assert.ok(!d.keys.includes(k)); assert.ok(!(k in d.set))
  }
  assert.equal(canon(s), canon(base()))
})

test('a list turning into something else, or the other way round, travels whole', () => {
  const s = base(); s.routines = []
  const d = roundTrip(base(), s)
  assert.deepEqual(d.set.routines, [])
  const b2 = base(); b2.workouts = []
  const d2 = roundTrip(b2, base())
  assert.equal(d2.set.workouts.length, 3)
})

test('applied to a different base, the text differs, so the hash check catches it', () => {
  const s = base(); s.workouts[0] = w('w1', 5)
  const d = makeDelta(base(), s)
  const other = base(); other.workouts[2] = w('w3', 1)        // another device wrote meanwhile
  assert.notEqual(canon(applyDelta(other, d)), canon(s))
})

test('a delta naming an entry the base does not have, or a bad shape, throws', () => {
  const s = base(); s.workouts = [w('w1'), w('w9')]
  const d = makeDelta(base(), s)
  d.lists.workouts.put = []                                    // w9 promised but not sent
  assert.throws(() => applyDelta(base(), d))
  assert.throws(() => applyDelta(base(), { keys: 'x' }))
  assert.throws(() => applyDelta(base(), { keys: ['missing'], set: {}, lists: {} }))
  assert.throws(() => applyDelta(base(), { keys: ['_rev'], set: { _rev: 1 }, lists: {} }))
})

test('a year of workouts: the delta for one changed workout is a small fraction', () => {
  const b = base()
  b.workouts = Array.from({ length: 170 }, (_, i) => w('w' + i, 6))
  const s = JSON.parse(JSON.stringify(b)); s.workouts[169] = w('w169', 7)
  const d = roundTrip(b, s)
  assert.ok(JSON.stringify(d).length * 10 < JSON.stringify(s).length)
})
