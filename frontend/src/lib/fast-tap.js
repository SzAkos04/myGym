import { useMemo, useRef } from 'react'

// A tap that lands while the page is still coasting from a flick. iOS uses that touch to stop the scroll
// and never turns it into a click, so a button pressed then did nothing and had to be pressed again. The
// touch events themselves still arrive, so the tap is read from them: a finger that went down and came up
// in about the same place, quickly, is a press. The click that follows a handled tap (where iOS does send
// one) is swallowed, and a click with no touch before it (keyboard, mouse, a screen reader) works as ever.
const SLOP = 10          // px the finger may drift and still be a tap
const MAX_MS = 600       // longer is a press-and-hold, not a tap
const GHOST_MS = 700     // how long after a handled tap a click is taken to be its echo

export function makeFastTap(getFn, now = () => Date.now()) {
  let start = null
  let firedAt = -Infinity
  return {
    onTouchStart: e => {
      const t = e.touches && e.touches[0]
      start = e.touches && e.touches.length === 1 && t ? { x: t.clientX, y: t.clientY, at: now() } : null
    },
    onTouchMove: () => {},
    onTouchEnd: e => {
      const s = start
      start = null
      const t = e.changedTouches && e.changedTouches[0]
      if (!s || !t) return
      if (Math.abs(t.clientX - s.x) > SLOP || Math.abs(t.clientY - s.y) > SLOP || now() - s.at > MAX_MS) return
      firedAt = now()
      if (e.cancelable) e.preventDefault()
      getFn()(e)
    },
    onTouchCancel: () => { start = null },
    onClick: e => {
      if (now() - firedAt < GHOST_MS) { e.preventDefault?.(); return }
      getFn()(e)
    },
  }
}

/** Props for a button: `<button {...useFastTap(onClick)}>`. Stable across renders; always calls the latest `fn`. */
export function useFastTap(fn) {
  const latest = useRef(fn)
  latest.current = fn
  return useMemo(() => makeFastTap(() => latest.current), [])
}
