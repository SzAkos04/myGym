import { describe, it, expect } from 'vitest'
import { derivedPrMap, prsOf } from './pr-derive.js'

const DAY = 86400000
const T0 = Date.UTC(2026, 0, 5, 10)
const set = (w, r, extra = {}) => ({ w, r, done: true, ...extra })
const session = (i, id, sets, extra = {}) => ({
  id: 'w' + i, d: new Date(T0 + i * DAY).toISOString().slice(0, 10), start: T0 + i * DAY,
  entries: [{ id, target: { mode: 'reps' }, sets }], prs: [], ...extra,
})

describe('derivedPrMap', () => {
  it('badges the session that first beat the best so far, not the first one or a tie', () => {
    const ws = [
      session(0, '0025', [set(60, 5)]),
      session(1, '0025', [set(62.5, 5)]),
      session(2, '0025', [set(62.5, 5)]),
      session(3, '0025', [set(65, 3)]),
    ]
    const m = derivedPrMap(ws)
    expect(m.get('w0')).toBeUndefined()
    expect(m.get('w1')).toEqual(['0025'])
    expect(m.get('w2')).toBeUndefined()
    expect(m.get('w3')).toEqual(['0025'])
  })

  it('reads the history in date order whatever order it is stored in', () => {
    const ws = [session(3, '0025', [set(65, 3)]), session(0, '0025', [set(60, 5)]), session(1, '0025', [set(62.5, 5)])]
    const m = derivedPrMap(ws)
    expect([...m.keys()].sort()).toEqual(['w1', 'w3'])
  })

  it('does not count warm-up sets toward a record', () => {
    const ws = [
      session(0, '0025', [set(60, 5)]),
      session(1, '0025', [set(100, 5, { phase: 'warmup', warmup: true }), set(60, 5)]),
    ]
    expect(derivedPrMap(ws).size).toBe(0)
  })

  it('keeps exercises apart and badges each one once per session', () => {
    const w1 = session(1, '0025', [set(65, 5)])
    w1.entries.push({ id: '0025', target: { mode: 'reps' }, sets: [set(66, 5)] }, { id: '0047', target: { mode: 'reps' }, sets: [set(40, 8)] })
    const ws = [session(0, '0025', [set(60, 5)]), w1]
    expect(derivedPrMap(ws).get('w1')).toEqual(['0025'])
  })

  it('copes with empty and malformed input', () => {
    expect(derivedPrMap(undefined).size).toBe(0)
    expect(derivedPrMap([{ id: 'x' }]).size).toBe(0)
  })
})

describe('prsOf', () => {
  it('adds the earned badges to the stored ones and never drops a stored one', () => {
    const ws = [session(0, '0025', [set(60, 5)]), session(1, '0025', [set(70, 5)], { prs: ['0047'] })]
    expect(prsOf(ws, ws[0])).toEqual([])
    expect(prsOf(ws, ws[1]).sort()).toEqual(['0025', '0047'])
  })

  it('returns the stored list when there is nothing to add', () => {
    const w = session(0, '0025', [set(60, 5)], { prs: ['0025'] })
    expect(prsOf([w], w)).toEqual(['0025'])
    expect(prsOf([], null)).toEqual([])
  })
})
