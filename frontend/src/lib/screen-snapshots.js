// What the swipe back needs to show under the screen it is dragging: a picture of the screen it goes
// back to. A copy of each screen is kept as it is left (components/ScreenGhost.jsx), the last few only,
// and the screens left behind are remembered as a stack, so the gesture can tell which screen is one step
// back. Plain memory: gone on a reload, which only means there is no step back until the app has been used.

const KEEP = 4
const copies = new Map()      // path -> detached copy of that screen, last used last

export const saveSnapshot = (path, node) => {
  if (!path || !node) return
  copies.delete(path)
  copies.set(path, node)
  while (copies.size > KEEP) copies.delete(copies.keys().next().value)
}
export const getSnapshot = path => copies.get(path) || null

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

/** For tests. */
export const resetSnapshots = () => { copies.clear(); entries.length = 0 }
