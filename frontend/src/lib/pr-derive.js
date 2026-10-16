// Personal-record badges for sessions that were never given any.
//
// `w.prs` is written once, at finish, so history that arrived by import (Strong, Hevy, CSV) or by
// backfill carries `prs: []` and shows no trophy anywhere. This reads the logged sets back in
// date order and names the session that first beat everything before it, the same "first
// reached" rule the exercise history uses, so the two screens agree.
//
// It never removes a badge a session already holds: the result is the stored list plus what the
// order of the history earns. The first time an exercise appears is not a record of anything.
import { workoutAt, bestWeightForEntry } from './history.js'
import { beatsWeight } from './exercises.js'

const keyOf = w => (w?.id != null ? w.id : `${w?.d}|${w?.start}`)

/** Map of workout key -> exercise ids that set a new best in that session, from `workouts` alone. */
export function derivedPrMap(workouts) {
  const out = new Map()
  const ordered = (workouts || []).map((w, i) => ({ w, i, t: workoutAt(w) }))
    .sort((a, b) => ((a.t || 0) - (b.t || 0)) || a.i - b.i)
  const best = new Map()
  for (const { w } of ordered) {
    const won = new Set()
    const sessionBest = new Map()
    for (const en of w.entries || []) {
      const v = bestWeightForEntry(en)
      if (!(v > 0)) continue
      const cur = sessionBest.get(en.id)
      if (cur === undefined || beatsWeight(en.id, v, cur)) sessionBest.set(en.id, v)
    }
    for (const [id, v] of sessionBest) {
      if (best.has(id) && beatsWeight(id, v, best.get(id))) won.add(id)
      if (!best.has(id) || beatsWeight(id, v, best.get(id))) best.set(id, v)
    }
    if (won.size) out.set(keyOf(w), [...won])
  }
  return out
}

const cache = new WeakMap()   // workouts array -> derived map; a store edit makes a new array

/** The exercise ids to badge on `w`: what it was stamped with at finish, plus what the history earns. */
export function prsOf(workouts, w) {
  if (!w) return []
  let map = cache.get(workouts)
  if (!map && Array.isArray(workouts)) { map = derivedPrMap(workouts); cache.set(workouts, map) }
  const extra = map?.get(keyOf(w))
  const stored = w.prs || []
  return extra ? [...new Set([...stored, ...extra])] : stored
}
