// Re-points everything that names one custom exercise at another exercise, so a custom
// "chest fly" that arrived with an import becomes the catalogue exercise it always was, in every
// logged session, routine and setting at once.
//
// Runs on the draft inside update(s => …). The store's update() already stamps the routines and
// the deleted custom exercise (stampRoutines, stampDeletions); what it cannot know is which saved
// workouts changed, so those are stamped here, and the per-exercise settings that sync by their
// own `_ts` get a stamped clear rather than a delete, or the other device would bring them back.
import { stampWorkout } from './sync-merge.js'

/** What would change, for the confirmation text: { workouts, entries, routines }. */
export function mergeImpact(S, fromId) {
  let workouts = 0, entries = 0
  for (const w of S?.workouts || []) {
    const n = (w.entries || []).filter(e => e.id === fromId).length
    if (n) { workouts++; entries += n }
  }
  const routines = (S?.routines || []).filter(r => (r.ex || []).some(e => e.id === fromId)).length
  return { workouts, entries, routines }
}

/**
 * Moves `fromId` onto `toId` in `S` (mutates). Only a custom exercise can be the source: a
 * catalogue id is permanent and other people's data points at it. Returns the impact, or null
 * when nothing was done (unknown source, same id, or a target that does not exist).
 */
export function mergeExerciseInto(S, fromId, toId, { exists = () => true, now = Date.now() } = {}) {
  if (!S || !fromId || !toId || fromId === toId) return null
  const source = (S.customEx || []).find(c => c.id === fromId)
  if (!source || !exists(toId)) return null
  const impact = mergeImpact(S, fromId)

  for (const w of S.workouts || []) {
    let touched = false
    for (const e of w.entries || []) if (e.id === fromId) { e.id = toId; delete e.n; touched = true }
    if (Array.isArray(w.prs) && w.prs.includes(fromId)) { w.prs = [...new Set(w.prs.map(i => (i === fromId ? toId : i)))]; touched = true }
    if (touched) stampWorkout(w, now)
  }

  // A routine that already trains the target keeps that slot; the duplicate slot goes.
  for (const r of S.routines || []) {
    if (!(r.ex || []).some(e => e.id === fromId)) continue
    const has = r.ex.some(e => e.id === toId)
    r.ex = has ? r.ex.filter(e => e.id !== fromId) : r.ex.map(e => (e.id === fromId ? { ...e, id: toId } : e))
  }

  if (Array.isArray(S.favEx) && S.favEx.includes(fromId)) S.favEx = [...new Set(S.favEx.map(i => (i === fromId ? toId : i)))]

  // Last-used weight: the more recent of the two survives.
  const ew = S.exWeights?.[fromId]
  if (ew) {
    const cur = S.exWeights[toId]
    if (!cur || String(ew.d || '') > String(cur.d || '')) S.exWeights[toId] = ew
    delete S.exWeights[fromId]
  }

  // Plain per-exercise maps: the target's own value wins, the source's fills a gap.
  for (const key of ['exNotes', 'barWeights']) {
    const m = S[key]
    if (!m || !(fromId in m)) continue
    if (!(toId in m)) m[toId] = m[fromId]
    delete m[fromId]
  }

  // Stamped per-exercise settings: move to the target if it has none, and clear the source with a
  // stamped entry so the clear wins the next merge.
  for (const [key, clear] of [['loadKind', { kind: null }], ['dbLoad', { mode: null }]]) {
    const m = S[key]
    if (!m || !(fromId in m)) continue
    if (!(toId in m)) m[toId] = { ...m[fromId], _ts: now }
    m[fromId] = { ...clear, _ts: now }
  }

  S.customEx = (S.customEx || []).filter(c => c.id !== fromId)
  return impact
}
