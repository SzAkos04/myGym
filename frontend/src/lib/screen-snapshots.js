// What the swipe back needs to show under the screen it is dragging: a picture of the screen it goes
// back to. A copy of each screen is kept as it is left (components/ScreenGhost.jsx), the last few only,
// and the path of every entry in the history is remembered (components/ViewRouter.jsx) so the gesture
// can tell which screen is one step back. Both are plain memory: gone on a reload, which only means the
// swipe falls back to the system's own gesture until the screens have been visited again.

const KEEP = 4
const copies = new Map()      // path -> detached copy of that screen, last used last
const stack = []              // history index -> path

export const saveSnapshot = (path, node) => {
  if (!path || !node) return
  copies.delete(path)
  copies.set(path, node)
  while (copies.size > KEEP) copies.delete(copies.keys().next().value)
}
export const getSnapshot = path => copies.get(path) || null

/** The path at a history index; a push or replace there drops everything after it, as the history does. */
export const recordPath = (idx, path) => { stack[idx] = path; stack.length = idx + 1 }
export const pathBefore = idx => (idx > 0 ? stack[idx - 1] || null : null)

/** For tests. */
export const resetSnapshots = () => { copies.clear(); stack.length = 0 }
