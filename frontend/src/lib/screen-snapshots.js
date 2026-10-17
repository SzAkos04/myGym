// What the swipe back needs to show under the screen it is dragging: a picture of the screen it goes
// back to. A copy of each screen is kept as it is left (components/ScreenGhost.jsx), the last few only.
// Which screen is one step back is lib/app-history.js. Plain memory: gone on a reload.

const KEEP = 4
const copies = new Map()      // path -> detached copy of that screen, last used last

export const saveSnapshot = (path, node) => {
  if (!path || !node) return
  copies.delete(path)
  copies.set(path, node)
  while (copies.size > KEEP) copies.delete(copies.keys().next().value)
}
export const getSnapshot = path => copies.get(path) || null

// The tab bar as it was when the workout covered it: the workout has none, and as it sinks away
// (EdgeSwipeBack.jsx) this copy sits on the picture of the screen beneath, where the real bar then
// takes its place. A copy and not the bar itself: a live bar over the sliding screen stopped the slide.
let tabBar = null
export const saveTabBar = nodes => { tabBar = nodes && nodes.length ? nodes : null }
export const getTabBar = () => tabBar

/** For tests. */
export const resetSnapshots = () => { copies.clear(); tabBar = null }
