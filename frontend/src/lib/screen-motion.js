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

/**
 * How a screen change should look, the way iOS does it:
 *   'tab'  between two bottom tabs: a quick cross-fade, no sideways slide (a tab bar never slides);
 *   'push' deeper into a screen: the new one slides in from the right over the old, which drifts left;
 *   'pop'  back out: the leaving screen slides off to the right, the one beneath comes back;
 *   'up' / 'down' the workout, which rises over everything like a modal and sinks away again;
 *   'none' on the first screen or when nothing changes.
 * `navType` is react-router's: PUSH, POP, REPLACE.
 */
export function motionDir(prev, next, navType) {
  if (!prev || prev === next) return 'none'
  const full = p => String(p).split('/')[1] === 'workout'
  if (full(next)) return 'up'
  if (full(prev)) return 'down'
  const a = tabIndexOf(prev), b = tabIndexOf(next)
  if (a != null && b != null && a !== b) return 'tab'
  return navType === 'POP' ? 'pop' : 'push'
}

// The direction of the screen change in flight, for the copy of the old screen that slides away
// (components/ScreenGhost.jsx reads it as it unmounts, in the same commit that set it).
let current = 'none'
export const setMotion = d => { current = d }
export const getMotion = () => current
