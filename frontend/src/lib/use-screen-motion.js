import { useRef } from 'react'
import { motionDir, setMotion, takeGesture } from './screen-motion.js'

/**
 * Which way the screen change that put `pathname` on screen moves (lib/screen-motion.js), or 'gesture'
 * when the browser's own back swipe has already shown it. Worked out once per path: a render that only
 * re-reads the same path keeps the direction, or the animation would be swapped halfway through.
 */
export function useScreenMotion(pathname, navType) {
  const motion = useRef({ path: null, dir: 'none', last: null })
  if (motion.current.path !== pathname) {
    let dir = takeGesture() ? 'gesture' : motionDir(motion.current.last, pathname, navType)
    // A redirect (REPLACE) is not a screen the user went to, except the "up one level" a back button falls
    // back on when nothing was left behind (views/Settings.jsx): that one still steps out.
    if (navType === 'REPLACE' && dir !== 'pop' && dir !== 'gesture') dir = 'none'
    motion.current = { path: pathname, dir, last: pathname }
    setMotion(motion.current.dir)
  }
  return motion.current.dir
}
