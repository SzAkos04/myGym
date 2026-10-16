import { describe, it, expect } from 'vitest'
import { sideBalance } from './side-balance.js'

const DAY = 86400000
const T0 = Date.UTC(2026, 0, 5, 10)
const side = (l, r, w = 10, extra = {}) => ({ w, r: l + r, done: true, ...extra, sides: { L: { w, r: l, done: true }, R: { w, r, done: true } } })
const session = (i, sets, id = 'curl') => ({ id: 'w' + i, d: '2026-01-0' + (i + 1), start: T0 + i * DAY, entries: [{ id, sets }] })

describe('sideBalance', () => {
  it('names the weaker side and averages the gap per set', () => {
    const ws = [session(0, [side(10, 8), side(9, 7)]), session(1, [side(10, 9)])]
    expect(sideBalance(ws, 'curl')).toEqual({ sessions: 2, sets: 3, repsDiff: 1.7, weightDiff: 0, weakSide: 'R' })
  })

  it('calls it level within half a rep', () => {
    const ws = [session(0, [side(10, 10), side(10, 10), side(9, 10)])]
    expect(sideBalance(ws, 'curl').weakSide).toBeNull()
  })

  it('reads the weight gap too', () => {
    const s = side(10, 10)
    s.sides.R.w = 8
    expect(sideBalance([session(0, [s])], 'curl')).toMatchObject({ weightDiff: 2, weakSide: null })
  })

  it('uses only the newest sessions, skips warm-ups and half-ticked sets, and reports null with no side data', () => {
    const half = side(10, 5)
    half.sides.R.done = false
    const ws = [
      session(0, [side(10, 2)]),                                  // oldest, outside the window
      session(1, [side(10, 8, 10, { phase: 'warmup', warmup: true }), half, { w: 10, r: 20, done: true }]),
      session(2, [side(8, 10)]),
    ]
    expect(sideBalance(ws, 'curl', { sessions: 1 })).toMatchObject({ sessions: 1, sets: 1, repsDiff: 2, weakSide: 'L' })
    expect(sideBalance([session(1, [half, { w: 10, r: 20, done: true }])], 'curl')).toBeNull()
    expect(sideBalance([], 'curl')).toBeNull()
    expect(sideBalance(undefined, 'curl')).toBeNull()
  })
})
