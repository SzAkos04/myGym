// The installed iOS app keeps its own history here instead of the browser's (components/ViewRouter.jsx):
// every step into a screen puts the one it left on this stack, and a step back takes entries off it.
// The browser then has no earlier entry for its own swipe back to act on, and the app's gesture is the
// only one.
const MAX_ENTRIES = 60
const entries = []            // the screens left behind, newest last: { path, loc }

export const pushEntry = entry => { entries.push(entry); if (entries.length > MAX_ENTRIES) entries.shift() }
/** Takes `n` entries off (as many as there are); returns the one now reached, or null when there is none. */
export const popEntries = n => {
  if (!entries.length) return null
  const k = Math.min(Math.max(1, n), entries.length)
  const target = entries[entries.length - k]
  entries.length -= k
  return target
}
export const entryCount = () => entries.length
export const previousPath = () => (entries.length ? entries[entries.length - 1].path : null)

// The back animation the swipe already has, for the buttons: EdgeSwipeBack registers a function that slides the
// current screen away over the copy of `dest` (sideways for kind 'pop', down for 'down': the workout) and then calls `proceed` (the step itself). It answers false when
// it cannot (no copy of that screen, not the installed app), and the step is taken at once.
let backAnimator = null
export const setBackAnimator = fn => { backAnimator = fn }
export const animateBack = (dest, proceed, kind = 'pop') => (backAnimator && dest ? !!backAnimator(dest, proceed, kind) : false)

/** For tests. */
export const resetAppHistory = () => { entries.length = 0; backAnimator = null }
