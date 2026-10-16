import { describe, it, expect } from 'vitest'
import { isUnilateralEx } from './exercises.js'
import { defaultConfig } from './history.js'

describe('isUnilateralEx', () => {
  it('recognises one-limb catalogue exercises by name', () => {
    expect(isUnilateralEx('4838')).toBe(true)   // cable unilateral bicep curl
    expect(isUnilateralEx('0231')).toBe(true)   // cable standing one arm triceps extension
    expect(isUnilateralEx('1425')).toBe(true)   // sled 45 degrees one leg press
  })
  it('leaves two-limb and alternating exercises alone', () => {
    expect(isUnilateralEx('0025')).toBe(false)  // barbell bench press
    expect(isUnilateralEx('nope')).toBe(false)
    expect(isUnilateralEx({ n: 'dumbbell alternate biceps curl' })).toBe(false)
    expect(isUnilateralEx({ n: 'Single Arm Row' })).toBe(true)
  })
})

describe('defaultConfig for a unilateral exercise', () => {
  it('starts it logged per side, and leaves other exercises byte-for-byte as before', () => {
    expect(defaultConfig('4838')).toMatchObject({ sets: 3, reps: 10, mode: 'reps', side: true })
    expect(defaultConfig('0025')).toEqual({ sets: 3, reps: 10, weight: 0, mode: 'reps' })
  })
})
