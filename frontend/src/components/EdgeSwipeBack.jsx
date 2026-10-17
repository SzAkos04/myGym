import { useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { isIosApp, markGesture, takeGesture, depthOf } from '../lib/screen-motion.js'
import { getSnapshot, previousPath, entryCount } from '../lib/screen-snapshots.js'
import { EDGE, progressOf, shouldComplete, underShift, dimAt } from '../lib/edge-swipe.js'

// The swipe back from the left edge, in the installed iOS app, done by the app itself. The system's
// own gesture shows a snapshot of the previous screen under the page, and that snapshot is missing
// when the page was scrolled (a black screen until the animation ends). So the touch that starts at
// the edge is taken here: the screen follows the finger, a copy of the previous screen kept as it was left (lib/screen-snapshots.js)
// drifts in beneath it, and on release it either goes back one step or springs back.
//
// It only starts from a screen opened from another one (never from a tab's own screen: switching tabs is
// not a step the user can undo with a swipe), when there is a step back, a copy of that screen to show
// and no sheet open. The
// browser has no earlier entry of its own in this app (components/ViewRouter.jsx), so the system's
// edge swipe has nothing to act on and this is the only gesture.
export default function EdgeSwipeBack() {
  const nav = useNavigate()
  const { pathname } = useLocation()
  useEffect(() => {
    if (!isIosApp()) return
    let g = null
    const live = () => document.getElementById('app')            // the real screen: first in the document

    const place = dx => {
      const W = window.innerWidth, p = progressOf(dx, W)
      g.app.style.transform = `translate3d(${dx}px,0,0)`
      g.copy.style.transform = `translate3d(${underShift(p, W)}px,0,0)`
      g.under.style.setProperty('--dim', dimAt(p))
    }
    const done = () => {
      g?.under.remove()
      if (g?.app) { g.app.style.transform = ''; g.app.style.transition = ''; g.app.style.boxShadow = ''; g.app.style.willChange = '' }
      g = null
    }
    const settle = (toDx, then) => {
      const W = window.innerWidth
      g.app.style.transition = 'transform 280ms cubic-bezier(.32,.72,0,1)'
      g.copy.style.transition = 'transform 280ms cubic-bezier(.32,.72,0,1)'
      g.under.style.transition = 'none'
      place(toDx)
      g.under.style.setProperty('--dim', dimAt(progressOf(toDx, W)))
      setTimeout(then, 290)
    }

    const start = e => {
      if (g || e.touches.length !== 1) return
      const t = e.touches[0]
      if (t.clientX > EDGE) return
      // Only from a screen that was opened from another one: a tab's own screen has nothing behind it.
      if (depthOf(pathname) <= 0 || entryCount() <= 0) return
      if (document.body.style.position === 'fixed' || document.getElementById('modal-root')?.classList.contains('open')) return
      const snap = getSnapshot(previousPath())
      const app = live()
      if (!snap || !app) return                                   // nothing to show beneath: the system's gesture stays
      e.preventDefault()
      const under = document.createElement('div')
      under.className = 'screen-under'
      under.setAttribute('aria-hidden', 'true')
      const copy = snap.cloneNode(true)
      under.appendChild(copy)
      document.body.appendChild(under)
      // The screen's own slide-in keeps its last frame (fill-mode both) and an animation outranks an inline
      // style: without this the finger moved nothing and the screen was swapped at once at the end.
      app.style.animation = 'none'
      app.style.willChange = 'transform'
      app.style.boxShadow = '-12px 0 30px rgba(0,0,0,.28)'
      g = { x0: t.clientX, last: t.clientX, lastT: performance.now(), vx: 0, dx: 0, app, under, copy }
      place(0)
    }
    const move = e => {
      if (!g) return
      const x = e.touches[0].clientX, now = performance.now()
      if (now > g.lastT) g.vx = (x - g.last) / (now - g.lastT)
      g.last = x; g.lastT = now
      g.dx = Math.max(0, x - g.x0)
      e.preventDefault()
      place(g.dx)
    }
    const end = () => {
      if (!g) return
      const W = window.innerWidth
      if (shouldComplete({ dx: g.dx, width: W, vx: g.vx })) {
        settle(W, () => {
          markGesture()                                           // the move is already shown: no second animation
          nav(-1)
          // a step that did not happen must not leave its mark on the next screen change
          setTimeout(takeGesture, 700)
          requestAnimationFrame(() => requestAnimationFrame(done))
        })
      } else settle(0, done)
    }

    window.addEventListener('touchstart', start, { passive: false })
    window.addEventListener('touchmove', move, { passive: false })
    window.addEventListener('touchend', end)
    window.addEventListener('touchcancel', end)
    return () => {
      window.removeEventListener('touchstart', start)
      window.removeEventListener('touchmove', move)
      window.removeEventListener('touchend', end)
      window.removeEventListener('touchcancel', end)
      done()
    }
  }, [nav, pathname])
  return null
}
