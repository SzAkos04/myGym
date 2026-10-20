import { describe, expect, it } from 'vitest'
import { bestSet, setsLine } from './home-workout.js'

const word = n => `${n} sets`

describe('setsLine', () => {
  it('folds alike sets into a count and lists different ones', () => {
    expect(setsLine(['60×8', '60×8', '60×8'], word)).toBe('3 sets · 60×8')
    expect(setsLine(['60×8', '65×6'], word)).toBe('60×8 · 65×6')
    expect(setsLine(['60×8'], word)).toBe('60×8')
    expect(setsLine([], word)).toBe('')
  })
})

describe('bestSet', () => {
  it('takes the heaviest done work set, more reps on a tie, never a warm-up or an undone set', () => {
    const sets = [
      { w: 100, r: 5, done: true, warmup: true },
      { w: 80, r: 8, done: true },
      { w: 80, r: 10, done: true },
      { w: 90, r: 3, done: false },
    ]
    expect(bestSet(sets)).toMatchObject({ w: 80, r: 10 })
    expect(bestSet([{ w: 50, r: 5 }])).toBeNull()
    expect(bestSet(undefined)).toBeNull()
  })
})
