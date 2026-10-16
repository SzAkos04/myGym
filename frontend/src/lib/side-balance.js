// Left/right balance of a unilateral exercise, from the per-side rows (workout-model.js
// isSideSet) of its latest sessions. A row logged as one combined set carries no side data, so an
// exercise that was only ever logged that way reports null, never a balance of zero.
import { workoutAt } from './history.js'
import { isSideSet, isWarmupRow } from './workout-model.js'

/**
 * { sessions, sets, repsDiff, weightDiff, weakSide } over the last `sessions` workouts that hold
 * completed per-side sets of `exId`. `repsDiff` is the average of (stronger side − weaker side)
 * reps per set, always >= 0; `weakSide` is 'L' or 'R', or null when the sides are level within
 * half a rep. Warm-ups and sets with a side left unticked are left out.
 */
export function sideBalance(workouts, exId, { sessions = 5 } = {}) {
  const ordered = (workouts || []).filter(w => (w.entries || []).some(e => e.id === exId))
    .sort((a, b) => (workoutAt(b) || 0) - (workoutAt(a) || 0))
  let usedSessions = 0, sets = 0, signedReps = 0, signedWeight = 0
  for (const w of ordered) {
    let any = false
    for (const e of w.entries) {
      if (e.id !== exId) continue
      for (const s of e.sets || []) {
        if (!isSideSet(s) || isWarmupRow(s) || !s.sides.L.done || !s.sides.R.done) continue
        signedReps += (Number(s.sides.L.r) || 0) - (Number(s.sides.R.r) || 0)
        signedWeight += (Number(s.sides.L.w) || 0) - (Number(s.sides.R.w) || 0)
        sets++; any = true
      }
    }
    if (any && ++usedSessions >= sessions) break
  }
  if (!sets) return null
  const meanReps = signedReps / sets
  const meanWeight = signedWeight / sets
  const round = v => Math.round(v * 10) / 10
  return {
    sessions: usedSessions, sets,
    repsDiff: round(Math.abs(meanReps)),
    weightDiff: round(Math.abs(meanWeight)),
    weakSide: Math.abs(meanReps) < 0.5 ? null : meanReps < 0 ? 'L' : 'R',
  }
}
