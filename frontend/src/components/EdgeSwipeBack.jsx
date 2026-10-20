import { useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { isIosApp, markGesture, takeGesture, depthOf } from '../lib/screen-motion.js'
import { getSnapshot, getTabBar } from '../lib/screen-snapshots.js'
import { previousPath, entryCount, setBackAnimator } from '../lib/app-history.js'
import { EDGE, progressOf, shouldComplete, underShift, dimAt } from '../lib/edge-swipe.js'

// The swipe back from the left edge, in the installed iOS app, done by the app itself. The system's
// own gesture shows a snapshot of the previous screen under the page, and that snapshot is missing
// when the page was scrolled (a black screen until the animation ends). So the touch that starts at
// the edge is taken here: the screen follows the finger, a copy of the previous screen kept as it was left (lib/screen-snapshots.js, lib/app-history.js)
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

    // `g.vert`: the workout sinking away (down) instead of a screen sliding off to the right.
    const span = () => (g?.vert ? window.innerHeight : window.innerWidth)
    const place = dx => {
      const W = span(), p = progressOf(dx, W)
      g.app.style.transform = g.vert ? `translate3d(0,${dx}px,0)` : `translate3d(${dx}px,0,0)`
      g.copy.style.transform = g.vert ? 'none' : `translate3d(${underShift(p, W)}px,0,0)`
      g.under.style.setProperty('--dim', dimAt(p))
    }
    const done = () => {
      for (const a of g?.anims || []) a.cancel()
      g?.under.remove()
      if (g?.app) { g.app.style.transform = ''; g.app.style.transition = ''; g.app.style.boxShadow = ''; g.app.style.willChange = '' }
      g = null
    }
    // 280 ms after a finger, which has already carried the screen part of the way; the workout sinking
    // away takes as long as it took to rise (index.css scr-up-in, 480 ms), or it looked like a drop.
    // Run as Web Animations, not as a transition on the inline transform: on an iPhone 11 (iOS app) the
    // transition never showed a frame for the Home and back buttons, the screen was swapped at once at
    // the end, while the CSS animations that open a screen moved fine. An element.animate() sits above
    // any CSS animation left on #app and needs no painted start to move from.
    const settle = (toDx, then, ms = 280) => {
      const W = span(), from = g.dx
      const opts = { duration: ms, easing: 'cubic-bezier(.32,.72,0,1)', fill: 'forwards' }
      const at = d => (g.vert ? `translate3d(0,${d}px,0)` : `translate3d(${d}px,0,0)`)
      const under = d => `translate3d(${underShift(progressOf(d, W), W)}px,0,0)`
      g.anims = [g.app.animate([{ transform: at(from) }, { transform: at(toDx) }], opts)]
      if (!g.vert) g.anims.push(g.copy.animate([{ transform: under(from) }, { transform: under(toDx) }], opts))
      g.under.style.transition = 'none'
      place(toDx)
      g.under.style.setProperty('--dim', dimAt(progressOf(toDx, W)))
      setTimeout(then, ms + 10)
    }

    const start = e => {
      if (g || e.touches.length !== 1) return
      const t = e.touches[0]
      if (t.clientX > EDGE) return
      // A touch on a control is a tap on it: the "‹ Home" / "‹ Settings" button starts 10 px from the
      // edge, and a thumb on its chevron was taken for a swipe that went nowhere, its click cancelled.
      if (e.target?.closest?.('button, a, input, select, textarea, label, [role="button"]')) return
      // Only from a screen that was opened from another one: a tab's own screen has nothing behind it.
      if (depthOf(pathname) <= 0 || entryCount() <= 0) return
      if (document.body.style.position === 'fixed' || document.getElementById('modal-root')?.classList.contains('open')) return
      const snap = getSnapshot(previousPath())
      const app = live()
      if (!snap || !app) return                                   // nothing to show beneath: the system's gesture stays
      e.preventDefault()
      begin(snap, app, t.clientX)
    }
    // Puts the copy of the earlier screen under the live one; from here the live one is moved by `place`.
    const begin = (snap, app, x0, vert = false) => {
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
      app.style.boxShadow = vert ? '0 -12px 30px rgba(0,0,0,.3)' : '-12px 0 30px rgba(0,0,0,.28)'
      g = { x0, last: x0, lastT: performance.now(), vx: 0, dx: 0, app, under, copy, vert }
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
    // The slide has reached the edge: take the step it showed, with no second animation on top, and
    // clear the copy once the new screen is painted.
    const arrive = step => () => {
      markGesture()
      step()
      setTimeout(takeGesture, 700)                                // a step that did not happen must not mark the next one
      requestAnimationFrame(() => requestAnimationFrame(done))
    }
    const end = () => {
      if (!g) return
      if (shouldComplete({ dx: g.dx, width: window.innerWidth, vx: g.vx })) settle(window.innerWidth, arrive(() => nav(-1)))
      else settle(0, done)
    }

    // The back and Home buttons and leaving the workout: the same slide as a completed swipe, sideways or
    // down (ViewRouter calls this before it steps).
    setBackAnimator((dest, proceed, kind) => {
      if (g) return true                                          // one already going: this press is the same step
      // No copy of the screen it goes back to (the app was just opened on this one): the page colour
      // beneath still lets the screen slide away, which beats it vanishing.
      const snap = getSnapshot(dest) || document.createElement('div'), app = live()
      if (!app) return false
      begin(snap, app, 0, kind === 'down')
      // The workout has no tab bar; Home has. Its copy lies on the picture beneath, so the bar is there as
      // the workout sinks off it, and the real one takes the same place when the route changes.
      if (kind === 'down') for (const n of getTabBar() || []) g.under.appendChild(n.cloneNode(true))
      void app.offsetWidth                                        // the start must be painted, or there is nothing to move from
      settle(span(), arrive(proceed), kind === 'down' ? 480 : 280)
      return true
    })

    window.addEventListener('touchstart', start, { passive: false })
    window.addEventListener('touchmove', move, { passive: false })
    window.addEventListener('touchend', end)
    window.addEventListener('touchcancel', end)
    return () => {
      setBackAnimator(null)
      window.removeEventListener('touchstart', start)
      window.removeEventListener('touchmove', move)
      window.removeEventListener('touchend', end)
      window.removeEventListener('touchcancel', end)
      done()
    }
  }, [nav, pathname])
  return null
}
