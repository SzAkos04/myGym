// Which way a screen change should move, like iOS: the bottom tabs slide sideways in their order
// (Home, Plan, Stats, Exercises), going deeper into a screen pushes from the right and coming back
// pops from the left. Pure, so the direction can be tested; App.jsx puts it on #app as data-dir.

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

/**
 * 'fwd' | 'back' between two tabs, 'push' | 'pop' within one tab (or into a screen under none),
 * 'none' on the first screen or when nothing changes. `navType` is react-router's: PUSH, POP, REPLACE.
 */
export function motionDir(prev, next, navType) {
  if (!prev || prev === next) return 'none'
  const a = tabIndexOf(prev), b = tabIndexOf(next)
  if (a != null && b != null && a !== b) return b > a ? 'fwd' : 'back'
  return navType === 'POP' ? 'pop' : 'push'
}

// The direction of the screen change in flight, for the copy of the old screen that slides away
// (components/ScreenGhost.jsx reads it as it unmounts, in the same commit that set it).
let current = 'none'
export const setMotion = d => { current = d }
export const getMotion = () => current
