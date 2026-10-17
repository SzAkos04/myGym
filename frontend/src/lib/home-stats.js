// Small numbers for Home, kept out of the view so they can be tested: how many working sets went to
// each muscle group in a week, what the last session was, and what today's routine asks for.
import { EXIDX } from './exercises.js'
import { muscleWeightsOf } from './muscles.js'
import { isWarmupRow } from './workout-model.js'
import { workoutAt } from './history.js'

/** Display groups, in the order they are listed: the English names are the i18n keys. */
export const SET_GROUPS = [
  { key: 'chest', name: 'Chest', muscles: ['chest'] },
  { key: 'back', name: 'Back', muscles: ['upper-back', 'lower-back', 'trapezius'] },
  { key: 'shoulders', name: 'Shoulders', muscles: ['deltoids'] },
  { key: 'arms', name: 'Arms', muscles: ['biceps', 'triceps', 'forearm'] },
  { key: 'quads', name: 'Quads', muscles: ['quadriceps'] },
  { key: 'hamstrings', name: 'Hamstrings', muscles: ['hamstring'] },
  { key: 'glutes', name: 'Glutes', muscles: ['gluteal'] },
  { key: 'calves', name: 'Calves', muscles: ['calves', 'tibialis'] },
  { key: 'core', name: 'Core', muscles: ['abs', 'obliques', 'serratus'] },
]
const GROUP_OF = {}
for (const g of SET_GROUPS) for (const m of g.muscles) GROUP_OF[m] = g.key

/** The groups an exercise counts for: only its primary muscles, never the helpers. */
export function primaryGroupsOf(entry) {
  const source = EXIDX[entry?.id] || (entry?.muscleSnapshot ? { muscleWeights: entry.muscleSnapshot } : entry)
  const weights = muscleWeightsOf(source)
  const out = new Set()
  for (const slug in weights) if (weights[slug] >= 1 && GROUP_OF[slug]) out.add(GROUP_OF[slug])
  return [...out]
}

/**
 * Working sets per muscle group over the workouts dated `fromISO`..`toISO` (inclusive).
 * A set is a ticked row that is not a warm-up; a left/right row is one set. A set counts once for
 * every group one of its primary muscles belongs to. Returns { groups: [{ key, name, sets }], total }
 * with only the groups that were trained, in SET_GROUPS order; `total` is every counted set once.
 */
export function weeklyWorkingSets(workouts, fromISO, toISO) {
  const by = {}
  let total = 0
  for (const w of workouts || []) {
    if (!w?.d || w.d < fromISO || w.d > toISO) continue
    for (const e of w.entries || []) {
      const n = (e.sets || []).filter(s => s?.done && !isWarmupRow(s)).length
      if (!n) continue
      total += n
      for (const key of primaryGroupsOf(e)) by[key] = (by[key] || 0) + n
    }
  }
  return { groups: SET_GROUPS.filter(g => by[g.key] > 0).map(g => ({ key: g.key, name: g.name, sets: by[g.key] })), total }
}

/** The session logged last: { name, d, mins, volume, prs, sets } or null. */
export function lastWorkoutSummary(workouts) {
  let last = null
  for (const w of workouts || []) if (!last || (workoutAt(w) || 0) >= (workoutAt(last) || 0)) last = w
  if (!last) return null
  const mins = last.end > last.start ? Math.round((last.end - last.start) / 60000) : 0
  const sets = (last.entries || []).reduce((n, e) => n + (e.sets || []).filter(s => s?.done && !isWarmupRow(s)).length, 0)
  return { name: last.name || '', d: last.d, mins, volume: Math.round(Number(last.vol) || 0), prs: (last.prs || []).length, sets }
}

const DAY = 86400000
const isoDay = iso => new Date(iso + 'T12:00:00').getTime()

/**
 * What today's routines ask for: { exercises, estMin, daysAgo, muscles }. `estMin` is how long the
 * last session of the same routine took (null when there is none, never a guess from set counts);
 * `daysAgo` is how long ago that was; `muscles` are the groups the planned work trains, the ones
 * with the most planned sets first, at most four.
 */
export function todaySummary(workouts, routines, todayISO) {
  const rs = (routines || []).filter(Boolean)
  const ids = new Set(rs.map(r => r.id))
  const exercises = rs.reduce((n, r) => n + (r.ex || []).length, 0)
  const by = {}
  for (const r of rs) for (const c of r.ex || []) {
    const sets = Math.max(1, Number(c.sets) || 1)
    for (const key of primaryGroupsOf(c)) by[key] = (by[key] || 0) + sets
  }
  const muscles = SET_GROUPS.filter(g => by[g.key]).sort((a, b) => by[b.key] - by[a.key]).slice(0, 4).map(g => g.name)
  let last = null
  for (const w of workouts || []) {
    const rid = Array.isArray(w.routineIds) ? w.routineIds : [w.routineId]
    if (!rid.some(id => ids.has(id))) continue
    if (!last || (workoutAt(w) || 0) >= (workoutAt(last) || 0)) last = w
  }
  const estMin = last && last.end > last.start ? Math.round((last.end - last.start) / 60000) : null
  const daysAgo = last && last.d ? Math.max(0, Math.round((isoDay(todayISO) - isoDay(last.d)) / DAY)) : null
  return { exercises, estMin, daysAgo, muscles }
}
