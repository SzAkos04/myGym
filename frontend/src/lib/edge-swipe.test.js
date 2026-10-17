import { describe, it, expect } from 'vitest'
import { EDGE, progressOf, shouldComplete, underShift, dimAt } from './edge-swipe.js'

describe('swipe back from the left edge', () => {
  it('measures the drag as a share of the width, never outside 0..1', () => {
    expect(progressOf(0, 400)).toBe(0)
    expect(progressOf(100, 400)).toBe(0.25)
    expect(progressOf(900, 400)).toBe(1)
    expect(progressOf(-30, 400)).toBe(0)
    expect(progressOf(50, 0)).toBe(0)
  })
  it('completes past about a third of the width, or on a quick flick', () => {
    expect(shouldComplete({ dx: 160, width: 400, vx: 0 })).toBe(true)
    expect(shouldComplete({ dx: 100, width: 400, vx: 0.1 })).toBe(false)
    expect(shouldComplete({ dx: 100, width: 400, vx: 0.8 })).toBe(true)
    expect(shouldComplete({ dx: 20, width: 400, vx: 2 })).toBe(false)      // a twitch is not a swipe
  })
  it('lets the screen underneath drift in and clear out of its dim as the top one leaves', () => {
    expect(underShift(0, 400)).toBeCloseTo(-112)
    expect(underShift(1, 400)).toBeCloseTo(0)
    expect(dimAt(0)).toBeCloseTo(0.24)
    expect(dimAt(1)).toBe(0)
  })
  it('only starts at the very edge', () => {
    expect(EDGE).toBeGreaterThan(10)
    expect(EDGE).toBeLessThan(40)
  })
})
