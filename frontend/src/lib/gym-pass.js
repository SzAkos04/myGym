// Gym passes (myGym): what you paid for and until when, so the app can stay out of the way while a
// pass is good and say so when the next one is due. Stored as S.gymPasses, merged per pass across
// devices like the gym cards (lib/sync-merge.js):
//
//   { id, kind: 'time' | 'visits', start: 'YYYY-MM-DD',
//     days?    — a time pass: how long, counting the first day
//     visits?  — a visit pass: how many
//     until?   — a visit pass's own expiry, if it has one
//     price?, cur?  — what it cost, for the list of earlier passes
//     remind?  — days before the end that count as due (default REMIND_DAYS)
//     extra?   — days visited without a logged workout (a visit pass counts workouts by itself)
//     later?   — 'due' | 'expired': the Home card was put off for this state of this pass }
//
// Visits are counted, not stored: every day with a logged workout inside the pass counts once,
// plus the extra days. An edited or deleted workout therefore counts right on every device.

export const REMIND_DAYS = 3
export const LOW_VISITS = 2
// A pass long gone is a gym you left, not one to renew: past this the app stops mentioning it.
export const LAPSED_DAYS = 30

// Calendar arithmetic at UTC noon: no zone or DST edge moves the day (api/nudge.js does the same).
export const addDays = (iso, n) => new Date(Date.parse(iso + 'T12:00:00Z') + n * 86400000).toISOString().slice(0, 10)
export const daysBetween = (a, b) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 86400000)

const valid = p => p && typeof p === 'object' && typeof p.start === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(p.start)
const passes = S => (Array.isArray(S?.gymPasses) ? S.gymPasses.filter(valid) : [])

/** The last day a pass is good for, or null for a visit pass without an expiry. */
export function passEnd(p) {
  if (p.kind === 'visits') return typeof p.until === 'string' ? p.until : null
  return addDays(p.start, Math.max(1, Number(p.days) || 30) - 1)
}

/** Days with a visit inside the pass, up to `today`: logged workouts plus the extra days. */
export function visitsUsed(p, workouts, today) {
  const end = passEnd(p)
  const last = end && end < today ? end : today
  const days = new Set()
  for (const w of Array.isArray(workouts) ? workouts : []) if (w?.d >= p.start && w.d <= last) days.add(w.d)
  for (const d of Array.isArray(p.extra) ? p.extra : []) if (d >= p.start && d <= last) days.add(d)
  return days.size
}

/** Passes newest first: the one that started last leads. */
export const passHistory = S => passes(S).slice().sort((a, b) => (a.start < b.start ? 1 : a.start > b.start ? -1 : 0))

/**
 * Where the pass stands today:
 *   state  'none'    no pass, or the last one ran out over LAPSED_DAYS ago
 *          'ok'      good, or already renewed (a pass that starts later is on record)
 *          'due'     ends within its reminder days, or LOW_VISITS visits or fewer are left
 *          'expired' ran out, or every visit is used
 *   pass, end, daysLeft (to the end, 0 on the last day), visitsLeft, used, next (the renewal)
 *   later   the Home card was put off for this state: show the quiet line instead
 */
export function passStatus(S, today) {
  const all = passHistory(S)
  const none = { state: 'none', pass: null, next: null }
  if (!all.length) return none
  const next = all.find(p => p.start > today) || null
  const pass = all.find(p => p.start <= today) || null
  if (!pass) return { ...none, state: next ? 'ok' : 'none', next }
  const end = passEnd(pass)
  const used = pass.kind === 'visits' ? visitsUsed(pass, S.workouts, today) : null
  const visitsLeft = pass.kind === 'visits' ? Math.max(0, (Number(pass.visits) || 0) - used) : null
  const daysLeft = end ? daysBetween(today, end) : null
  const out = { pass, end, daysLeft, visitsLeft, used, next }
  const expired = (end && today > end) || (visitsLeft != null && visitsLeft <= 0)
  if (next) return { ...out, state: 'ok' }
  if (expired) {
    const since = end && today > end ? daysBetween(end, today) : 0
    if (since > LAPSED_DAYS) return { ...none, pass, end }
    return { ...out, state: 'expired', later: pass.later === 'expired' }
  }
  const remind = Number.isFinite(Number(pass.remind)) ? Number(pass.remind) : REMIND_DAYS
  const due = (daysLeft != null && daysLeft <= remind) || (visitsLeft != null && visitsLeft <= LOW_VISITS)
  if (due) return { ...out, state: 'due', later: pass.later === 'due' || pass.later === 'expired' }
  return { ...out, state: 'ok' }
}

/**
 * The next pass, filled in from `prev` — what "Bought it" opens: the same kind, length, visits,
 * price and reminder, starting the day after the old one ends (or today, if that has passed or
 * the old one has no end). A visit pass's own expiry keeps its length.
 */
export function renewalDraft(prev, today) {
  // A visit pass is renewed when its visits run out, whatever date it is good until: the new one
  // starts today and counts from there.
  const end = prev && prev.kind !== 'visits' ? passEnd(prev) : null
  const start = end && addDays(end, 1) > today ? addDays(end, 1) : today
  const draft = { kind: prev?.kind === 'visits' ? 'visits' : 'time', start }
  if (draft.kind === 'time') draft.days = Math.max(1, Number(prev?.days) || 30)
  else {
    draft.visits = Math.max(1, Number(prev?.visits) || 10)
    if (prev?.until) draft.until = addDays(start, Math.max(0, daysBetween(prev.start, prev.until)))
  }
  if (Number(prev?.price) > 0) draft.price = Number(prev.price)
  if (prev?.cur) draft.cur = prev.cur
  if (prev && Number.isFinite(Number(prev.remind))) draft.remind = Number(prev.remind)
  return draft
}

/** A pass as the form edits it, cleaned: whole numbers, no empty fields, a time pass without visit fields. */
export function cleanPass(p) {
  const out = { id: p.id, kind: p.kind === 'visits' ? 'visits' : 'time', start: p.start }
  if (out.kind === 'time') out.days = Math.max(1, Math.round(Number(p.days) || 30))
  else {
    out.visits = Math.max(1, Math.round(Number(p.visits) || 10))
    if (p.until && p.until >= p.start) out.until = p.until
    if (Array.isArray(p.extra) && p.extra.length) out.extra = [...new Set(p.extra)].sort()
  }
  if (Number(p.price) > 0) out.price = Math.round(Number(p.price) * 100) / 100
  if (p.cur && String(p.cur).trim()) out.cur = String(p.cur).trim().slice(0, 6)
  if (Number.isFinite(Number(p.remind)) && p.remind !== '' && p.remind != null) out.remind = Math.max(0, Math.min(30, Math.round(Number(p.remind))))
  return out
}
