// How a screen change should look, like iOS: tabs cross-fade, going deeper pushes from the right and
// coming back pops, the workout rises like a modal. Pure, so it can be tested; App.jsx puts it on #app as data-dir.

const TAB_ORDER = ['home', 'plan', 'stats', 'library']
// The same screens-under-a-tab mapping the tab bar highlights (components/TabBar.jsx).
const TAB_OF = {
  home: 'home', settings: 'home', checkin: 'home',
  plan: 'plan',
  stats: 'stats', history: 'stats', 'structural-balance': 'stats', 'progress-photos': 'stats', measurements: 'stats',
  library: 'library', muscles: 'library',
}

/** The index (0..3) of the tab a path lives under, or null for a screen that is under none (workout, coach, admin). */
export function tabIndexOf(pathname) {
  const seg = String(pathname || '').split('/')[1] || 'home'
  const tab = TAB_OF[seg]
  return tab ? TAB_ORDER.indexOf(tab) : null
}

const TAB_ROOTS = new Set(['home', 'plan', 'stats', 'library'])

/** How deep a screen is: 0 for a tab's own screen, then one more per level (/settings 1, /settings/sounds 2). */
export function depthOf(pathname) {
  const segs = String(pathname || '').split('/').filter(Boolean)
  if (segs.length === 0 || (segs.length === 1 && TAB_ROOTS.has(segs[0]))) return 0
  return segs.length
}

/**
 * How a screen change should look, the way iOS does it:
 *   'tab'  between two bottom tabs: a quick cross-fade, no sideways slide (a tab bar never slides);
 *   'push' deeper into a screen: the new one slides in from the right over the old, which drifts left;
 *   'pop'  back out to a shallower one: the leaving screen slides off to the right;
 *   'up' / 'down' the workout, which rises over everything like a modal and sinks away again;
 *   'none' on the first screen or when nothing changes.
 * Deeper or shallower is judged by the screens, not by how the browser got there: the "Home" button on
 * Settings is a plain navigation to /home (a PUSH to react-router), and it still has to pop.
 * `navType` only breaks a tie between two screens of the same depth.
 */
export function motionDir(prev, next, navType) {
  if (!prev || prev === next) return 'none'
  const full = p => String(p).split('/')[1] === 'workout'
  if (full(next)) return 'up'
  if (full(prev)) return 'down'
  const a = tabIndexOf(prev), b = tabIndexOf(next)
  if (a != null && b != null && a !== b) return 'tab'
  const da = depthOf(prev), db = depthOf(next)
  if (db > da) return 'push'
  if (db < da) return 'pop'
  return navType === 'POP' ? 'pop' : 'push'
}

// The direction of the screen change in flight, for the copy of the old screen that slides away
// (components/ScreenGhost.jsx reads it as it unmounts, in the same commit that set it).
let current = 'none'
export const setMotion = d => { current = d }
export const getMotion = () => current
