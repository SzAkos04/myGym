// What myGym leaves out of openGym. The switches are set at build time (vite.config.js, FORK_OFF and
// FORK_HIDDEN_CATEGORIES): the upstream code stays in the repo untouched, only its entrances ask here,
// so pulling upstream never conflicts over a deleted file. Under test everything is on.
//
//   COACH    the AI coach: its screens, the Plan button, its Settings page
//   CHECKIN  the gym check-in card and screen, with the QR / barcode scanning only it uses
//   ANDROID  the native phone app: "Get the Android app" and pairing a phone app with this server
//            (the phone build's own parts, frontend/android and ios, are not in this web build at all)
//   GUEST    "Continue without account" on the sign-in screen
//   ANALYSIS the training analysis the owner has no use for (he trains every set to failure and
//            judges his own recovery): Stats' Muscle balance / Fatigue / Strength card, the Effort card
//            and the Effort per set setting (so no effort column in a workout either), Structural
//            balance, Weekly muscle volume (and Plan's link to it), and Exercises' "By muscle" view
//
// The demo is not here: it only exists in the demo build (lib/demo.js), never in this one.
/* global __MYGYM_COACH__, __MYGYM_CHECKIN__, __MYGYM_ANDROID__, __MYGYM_GUEST__, __MYGYM_ANALYSIS__, __MYGYM_HIDDEN_CATEGORIES__ */
export const COACH = typeof __MYGYM_COACH__ === 'undefined' || __MYGYM_COACH__
export const CHECKIN = typeof __MYGYM_CHECKIN__ === 'undefined' || __MYGYM_CHECKIN__
export const ANDROID = typeof __MYGYM_ANDROID__ === 'undefined' || __MYGYM_ANDROID__
export const GUEST = typeof __MYGYM_GUEST__ === 'undefined' || __MYGYM_GUEST__
export const ANALYSIS = typeof __MYGYM_ANALYSIS__ === 'undefined' || __MYGYM_ANALYSIS__

// Kinds of exercise kept out of the lists, the search and the pickers (lib/exercises.js allExercises).
export const HIDDEN_CATEGORIES = new Set(typeof __MYGYM_HIDDEN_CATEGORIES__ === 'undefined' ? [] : __MYGYM_HIDDEN_CATEGORIES__)

// The exercises this profile has ever used: a hidden kind never hides one of them, so a logged
// "wrist extension" (mobility) still shows in the lists and can be picked again.
const usedCache = new WeakMap()
export function usedExerciseIds(st) {
  const key = st && (st.workouts || st)
  if (key && typeof key === 'object' && usedCache.has(key) && usedCache.get(key).routines === st.routines && usedCache.get(key).active === st.active) return usedCache.get(key).ids
  const ids = new Set()
  for (const w of st?.workouts || []) for (const e of w?.entries || []) if (e?.id != null) ids.add(String(e.id))
  for (const r of st?.routines || []) for (const x of r?.ex || []) { const id = x && typeof x === 'object' ? x.id : x; if (id != null) ids.add(String(id)) }
  for (const e of st?.active?.entries || []) if (e?.id != null) ids.add(String(e.id))
  if (key && typeof key === 'object') usedCache.set(key, { ids, routines: st.routines, active: st.active })
  return ids
}

/** The catalogue as the lists show it: without the hidden kinds, except what this profile has used. */
export function listedCatalogue(catalogue, st, hidden = HIDDEN_CATEGORIES) {
  if (!hidden.size) return catalogue
  const used = usedExerciseIds(st)
  return catalogue.filter(e => !hidden.has(e.cat) || used.has(String(e.id)))
}
