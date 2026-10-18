import { describe, expect, it } from 'vitest'
import { listedCatalogue, usedExerciseIds, COACH, CHECKIN, ANDROID, GUEST, HIDDEN_CATEGORIES } from './fork-profile.js'

const CAT = [
  { id: '1', cat: 'strength' }, { id: '2', cat: 'mobility' }, { id: '3', cat: 'yoga' },
  { id: '4', cat: 'stretching' }, { id: '5', cat: 'cardio' }, { id: '6', cat: 'rehab' },
]
const HIDE = new Set(['mobility', 'stretching', 'yoga', 'pilates', 'combat', 'rehab'])

describe('fork profile', () => {
  it('keeps every openGym feature on under test, so the upstream suites still cover them', () => {
    expect([COACH, CHECKIN, ANDROID, GUEST]).toEqual([true, true, true, true])
    expect(HIDDEN_CATEGORIES.size).toBe(0)
  })

  it('lists no exercise of a hidden kind', () => {
    expect(listedCatalogue(CAT, {}, HIDE).map(e => e.id)).toEqual(['1', '5'])
  })

  it('still lists a hidden kind this profile has used: in a workout, a routine or the running session', () => {
    const st = {
      workouts: [{ entries: [{ id: '2' }] }],          // a logged wrist extension (mobility)
      routines: [{ ex: [{ id: '3' }] }],
      active: { entries: [{ id: 6 }] },
    }
    expect(listedCatalogue(CAT, st, HIDE).map(e => e.id)).toEqual(['1', '2', '3', '5', '6'])
  })

  it('hides nothing when no kind is hidden (the test and upstream setting)', () => {
    expect(listedCatalogue(CAT, {})).toBe(CAT)
  })

  it('works out the used exercises once per state, and again when it changes', () => {
    const workouts = [{ entries: [{ id: '2' }] }]
    const st = { workouts, routines: [] }
    const a = usedExerciseIds(st)
    expect(usedExerciseIds({ ...st })).toBe(a)               // same workouts and routines: the same answer
    const b = usedExerciseIds({ workouts, routines: [{ ex: ['4'] }] })
    expect(b).not.toBe(a)
    expect(b.has('4')).toBe(true)
  })
})
