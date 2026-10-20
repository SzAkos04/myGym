// myGym fork: how Home's workout preview and Last workout card sum up an exercise's sets.
import { isWarmupRow } from './workout-model.js'

/** Planned or done work sets as one line: "3 sets · 60×8" when they are all alike, each one otherwise. */
export function setsLine(labels, setsWord) {
  if (!labels.length) return ''
  if (labels.length > 1 && labels.every(l => l === labels[0])) return `${setsWord(labels.length)} · ${labels[0]}`
  return labels.join(' · ')
}

/** The set that stands for an exercise in a finished workout: the heaviest done work set, most reps on a tie. */
export function bestSet(sets) {
  let best = null
  for (const s of sets || []) {
    if (!s?.done || isWarmupRow(s)) continue
    const w = Number(s.w) || 0, r = Number(s.r) || 0
    if (!best || w > (Number(best.w) || 0) || (w === (Number(best.w) || 0) && r > (Number(best.r) || 0))) best = s
  }
  return best
}
