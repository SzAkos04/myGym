import { describe, it, expect } from 'vitest'
import { mergeExerciseInto, mergeImpact } from './exercise-merge.js'

const NOW = 1_800_000_000_000
const base = () => ({
  customEx: [{ id: 'im1', n: 'chest fly', custom: true }, { id: 'keep', n: 'mine', custom: true }],
  workouts: [
    { id: 'a', d: '2026-01-01', entries: [{ id: 'im1', n: 'chest fly', sets: [] }, { id: '0025', sets: [] }], prs: ['im1'] },
    { id: 'b', d: '2026-01-02', entries: [{ id: '0025', sets: [] }], prs: [] },
    { id: 'c', d: '2026-01-03', entries: [{ id: 'im1', sets: [] }, { id: '0596', sets: [] }], prs: [] },
  ],
  routines: [{ id: 'r', ex: [{ id: 'im1', sets: 3 }, { id: '0025', sets: 3 }] }],
  favEx: ['im1', '0025'],
  exWeights: { im1: { w: 40, d: '2026-02-01' }, '0596': { w: 35, d: '2026-01-01' } },
  exNotes: { im1: 'seat 4' },
  barWeights: {},
  loadKind: { im1: { kind: 'single', _ts: 1 } },
  dbLoad: {},
})

describe('mergeExerciseInto', () => {
  it('re-points sessions, prs, routines, favourites and the last weight, and drops the custom row', () => {
    const S = base()
    const impact = mergeExerciseInto(S, 'im1', '0596', { now: NOW })
    expect(impact).toEqual({ workouts: 2, entries: 2, routines: 1 })
    expect(S.workouts[0].entries[0]).toEqual({ id: '0596', sets: [] })
    expect(S.workouts[0].prs).toEqual(['0596'])
    expect(S.workouts[2].entries.map(e => e.id)).toEqual(['0596', '0596'])   // both kept, never merged
    expect(S.routines[0].ex.map(e => e.id)).toEqual(['0596', '0025'])
    expect(S.favEx).toEqual(['0596', '0025'])
    expect(S.exWeights).toEqual({ '0596': { w: 40, d: '2026-02-01' } })      // the newer of the two
    expect(S.exNotes).toEqual({ '0596': 'seat 4' })
    expect(S.customEx.map(c => c.id)).toEqual(['keep'])
  })

  it('stamps only the workouts it changed, so the sync keeps the edit', () => {
    const S = base()
    mergeExerciseInto(S, 'im1', '0596', { now: NOW })
    expect(S.workouts.map(w => w._ts)).toEqual([NOW, undefined, NOW])
  })

  it('moves a stamped setting to the target and clears the source with a stamped entry', () => {
    const S = base()
    mergeExerciseInto(S, 'im1', '0596', { now: NOW })
    expect(S.loadKind['0596']).toEqual({ kind: 'single', _ts: NOW })
    expect(S.loadKind.im1).toEqual({ kind: null, _ts: NOW })
  })

  it('keeps the target\'s own setting, note and the single routine slot when it already has one', () => {
    const S = base()
    S.loadKind['0596'] = { kind: 'pairs', _ts: 5 }
    S.exNotes['0596'] = 'mine'
    S.routines[0].ex.push({ id: '0596', sets: 2 })
    mergeExerciseInto(S, 'im1', '0596', { now: NOW })
    expect(S.loadKind['0596']).toEqual({ kind: 'pairs', _ts: 5 })
    expect(S.exNotes['0596']).toBe('mine')
    expect(S.routines[0].ex.map(e => e.id)).toEqual(['0025', '0596'])
  })

  it('refuses a catalogue source, the same id, an unknown target and a missing state', () => {
    const S = base()
    expect(mergeExerciseInto(S, '0025', '0596')).toBeNull()
    expect(mergeExerciseInto(S, 'im1', 'im1')).toBeNull()
    expect(mergeExerciseInto(S, 'im1', 'nope', { exists: () => false })).toBeNull()
    expect(mergeExerciseInto(null, 'im1', '0596')).toBeNull()
    expect(S.customEx).toHaveLength(2)
    expect(S.workouts[0].entries[0].id).toBe('im1')
  })
})

describe('mergeImpact', () => {
  it('counts sessions, entries and routines naming the exercise', () => {
    expect(mergeImpact(base(), 'im1')).toEqual({ workouts: 2, entries: 2, routines: 1 })
    expect(mergeImpact({}, 'im1')).toEqual({ workouts: 0, entries: 0, routines: 0 })
  })
})
