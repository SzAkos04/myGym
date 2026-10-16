import { describe, it, expect } from 'vitest'
import { sideDefaultOf, withSideDefault } from './side-default.js'
import { defaultConfig } from './history.js'

describe('sideDefaultOf / withSideDefault', () => {
  it('is off until the user turns it on, and never reads the name', () => {
    expect(sideDefaultOf({}, '4838')).toBe(false)
    expect(sideDefaultOf(undefined, '4838')).toBe(false)
    const S = { sideEx: withSideDefault(undefined, '4838', true, 7) }
    expect(S.sideEx['4838']).toEqual({ on: true, _ts: 7 })
    expect(sideDefaultOf(S, '4838')).toBe(true)
    expect(sideDefaultOf(S, '0231')).toBe(false)
  })

  it('switching off is a stamped entry that keeps the other exercises', () => {
    const on = withSideDefault({ a: { on: true, _ts: 1 } }, 'b', true, 2)
    const off = withSideDefault(on, 'b', false, 3)
    expect(off).toEqual({ a: { on: true, _ts: 1 }, b: { on: false, _ts: 3 } })
  })
})

describe('defaultConfig', () => {
  it('starts per side only for an exercise the user switched on', () => {
    const S = { sideEx: { '4838': { on: true, _ts: 1 } } }
    expect(defaultConfig('4838', undefined, S)).toMatchObject({ sets: 3, reps: 10, mode: 'reps', side: true })
    expect(defaultConfig('4838')).toEqual({ sets: 3, reps: 10, weight: 0, mode: 'reps' })
    expect(defaultConfig('0231', undefined, S)).not.toHaveProperty('side')   // "one arm" in the name changes nothing
  })
})
