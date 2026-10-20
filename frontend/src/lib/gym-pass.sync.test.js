// Gym passes ride the same per-entry sync as the gym cards: these pin that both sides know the list.
import { describe, expect, it } from 'vitest'
import * as Server from '../../../api/sync-stamps.js'
import { mergeStates, stampChange } from './sync-merge.js'

const clone = o => JSON.parse(JSON.stringify(o))
const base = (over = {}) => ({
  unit: 'kg', week: {}, dayPlan: {}, workouts: [], routines: [], bodyweight: [], customEx: [], favEx: [],
  exWeights: {}, exNotes: {}, barWeights: {}, equipProfiles: [], gymCards: [], gymPasses: [], _ts: 0, ...over,
})
const pass = { id: 'p1', kind: 'time', start: '2026-10-01', days: 30 }

describe('gym passes across devices', () => {
  const both = () => {
    const prev = base({ _ts: 100 })
    const next = clone(prev); next.gymPasses = [clone(pass)]
    stampChange(prev, next, 100)
    return next
  }

  it('keeps a price set on one phone and a reminder changed on the other', () => {
    const a = clone(both()); a.gymPasses[0].price = 14900; stampChange(both(), a, 200)
    const b = clone(both()); b.gymPasses[0].remind = 5; stampChange(both(), b, 300)
    for (const m of [mergeStates(a, b), mergeStates(b, a)]) {
      expect(m.gymPasses).toHaveLength(1)
      expect(m.gymPasses[0]).toMatchObject({ id: 'p1', price: 14900, remind: 5 })
    }
  })

  it('a removed pass stays removed when the other phone comes back with a newer copy', () => {
    const a = clone(both()); a.gymPasses = []; stampChange(both(), a, 200)
    const b = clone(both()); b.bodyweight = [{ d: '2026-10-05', w: 80, t: 500 }]; stampChange(both(), b, 500)
    for (const m of [mergeStates(a, b), mergeStates(b, a)]) expect(m.gymPasses).toEqual([])
  })

  it('the server keeps the passes when an app that does not know them saves', () => {
    const cur = both()
    const older = clone(cur); delete older.gymPasses
    expect(Server.keepUnknown(cur, older).gymPasses.map(p => p.id)).toEqual(['p1'])
  })
})
