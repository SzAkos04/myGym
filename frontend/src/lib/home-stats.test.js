import { describe, it, expect } from 'vitest'
import { weeklyWorkingSets, lastWorkoutSummary, todaySummary, primaryGroupsOf } from './home-stats.js'

const set = (done = true, extra = {}) => ({ w: 50, r: 8, done, ...extra })
const w = (id, d, entries, extra = {}) => ({ id, d, start: Date.parse(d + 'T10:00:00'), entries, ...extra })

describe('primaryGroupsOf', () => {
  it('counts only the primary muscle, never the helpers', () => {
    expect(primaryGroupsOf({ id: '0025' })).toEqual(['chest'])        // barbell bench press: triceps and shoulders help
  })
  it('falls back to the snapshot an entry carries for an exercise that left the catalogue', () => {
    expect(primaryGroupsOf({ id: 'gone', muscleSnapshot: { biceps: 1, forearm: 0.5 } })).toEqual(['arms'])
    expect(primaryGroupsOf({ id: 'unknown-and-bare' })).toEqual([])
  })
})

describe('weeklyWorkingSets', () => {
  const week = [
    w('a', '2026-10-12', [{ id: '0025', sets: [set(), set(), set(true, { phase: 'warmup', warmup: true }), set(false)] }]),
    w('b', '2026-10-14', [{ id: '0025', sets: [set()] }, { id: '0027', sets: [set(), set()] }]),
    w('c', '2026-10-05', [{ id: '0025', sets: [set(), set(), set()] }]),     // the week before
  ]
  it('counts ticked, non-warm-up sets per group inside the dates', () => {
    const r = weeklyWorkingSets(week, '2026-10-12', '2026-10-18')
    expect(r.groups.find(g => g.key === 'chest').sets).toBe(3)               // 2 on the 12th, 1 on the 14th
    expect(r.groups.find(g => g.key === 'back').sets).toBe(2)
    expect(r.total).toBe(5)
    expect(weeklyWorkingSets(week, '2026-10-05', '2026-10-11').total).toBe(3)
  })
  it('counts a left/right row once', () => {
    const side = { w: 10, r: 16, done: true, sides: { L: { w: 10, r: 8, done: true }, R: { w: 10, r: 8, done: true } } }
    const r = weeklyWorkingSets([w('s', '2026-10-13', [{ id: '0025', sets: [side] }])], '2026-10-12', '2026-10-18')
    expect(r.total).toBe(1)
  })
  it('is empty with no workouts or bad input', () => {
    expect(weeklyWorkingSets([], '2026-10-12', '2026-10-18')).toEqual({ groups: [], total: 0 })
    expect(weeklyWorkingSets(undefined, 'a', 'b')).toEqual({ groups: [], total: 0 })
    expect(weeklyWorkingSets([{ entries: [] }, null], '2026-10-12', '2026-10-18').total).toBe(0)
  })
})

describe('lastWorkoutSummary', () => {
  it('reads the latest session, rounded', () => {
    const ws = [
      w('a', '2026-10-12', [], { name: 'Old', vol: 5000 }),
      w('b', '2026-10-15', [{ id: '0025', sets: [set(), set(true, { warmup: true }), set()] }],
        { name: 'Posterior', vol: 9840.4, end: Date.parse('2026-10-15T10:52:00'), prs: ['0025', '0047'] }),
    ]
    expect(lastWorkoutSummary(ws)).toEqual({ name: 'Posterior', d: '2026-10-15', mins: 52, volume: 9840, prs: 2, sets: 2 })
    expect(lastWorkoutSummary([])).toBeNull()
  })
})

describe('todaySummary', () => {
  const routine = { id: 'r1', name: 'Anterior', ex: [{ id: '0025', sets: 4 }, { id: '0047', sets: 3 }, { id: '0241', sets: 3 }] }
  it('counts exercises, names the muscles by planned sets and reads the last session of that routine', () => {
    const ws = [
      w('x', '2026-10-10', [], { routineId: 'r1', end: Date.parse('2026-10-10T10:55:00') }),
      w('y', '2026-10-12', [], { routineId: 'other', end: Date.parse('2026-10-12T11:00:00') }),
    ]
    const s = todaySummary(ws, [routine], '2026-10-17')
    expect(s.exercises).toBe(3)
    expect(s.estMin).toBe(55)
    expect(s.daysAgo).toBe(7)
    expect(s.muscles.length).toBeGreaterThan(0)
    expect(s.muscles.length).toBeLessThanOrEqual(4)
  })
  it('says nothing it does not know', () => {
    expect(todaySummary([], [routine], '2026-10-17')).toMatchObject({ estMin: null, daysAgo: null })
    expect(todaySummary([], [], '2026-10-17')).toEqual({ exercises: 0, estMin: null, daysAgo: null, muscles: [] })
  })
})
