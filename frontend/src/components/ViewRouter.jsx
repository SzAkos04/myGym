import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { Router, UNSAFE_createHashHistory as createHashHistory } from 'react-router-dom'
import { motionDir, isGestureMarked, isIosApp, isTabSwitch } from '../lib/screen-motion.js'
import { pushEntry, popEntries, previousPath, animateBack } from '../lib/app-history.js'

// A hash router whose screen changes are ours to animate. The declarative HashRouter has no hook for
// that, so the history is ours.
//
// Where the browser has View Transitions (document.startViewTransition) the change runs inside one:
// the browser snapshots the old and the new screen and animates between them on the GPU, the way iOS
// pushes, pops and cross-fades its screens (the CSS is in index.css, keyed on html[data-vt]). Where it
// has not, and under "reduce motion" and in the tests, the screen just swaps, and the DOM-copy animation
// in App.jsx / ScreenGhost.jsx covers it (html[data-vt-ok] switches that one off where this one runs).
//
// The installed iOS app is different on purpose. iOS has an edge swipe of its own there, which shows a
// snapshot of the previous screen under the page, and that snapshot was blank whenever the page had been
// scrolled; a swipe handled by the app (components/EdgeSwipeBack.jsx) did not stop the system's one
// either: the system took the touch over midway. So there the app keeps its own history in memory and
// writes every location over the browser's current entry (replace): the browser has no earlier entry,
// its swipe has nothing to go back to, and the app's gesture is the only one.

const canTransition = () => typeof document !== 'undefined' && typeof document.startViewTransition === 'function'
  && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  && !isIosApp()

const asTo = loc => ({ pathname: loc.pathname, search: loc.search, hash: loc.hash })

export default function ViewRouter({ children }) {
  const historyRef = useRef(null)
  const logical = useRef(null)          // what the app itself is doing in the iOS app: 'PUSH' or 'POP'
  if (historyRef.current == null) {
    const h = createHashHistory({ v5Compat: true })
    if (isIosApp()) {
      const replace = h.replace.bind(h)
      h.push = (to, state) => {
        // Between the tabs' own screens nothing is added: a tab bar has no step back, and neither may the swipe.
        const here = h.location.pathname
        const next = typeof to === 'string' ? to.split(/[?#]/)[0] : to?.pathname
        const step = () => {
          if (!isTabSwitch(here, next)) pushEntry({ path: here, loc: h.location })
          logical.current = 'PUSH'
          replace(to, state)
        }
        // A button that leads to a shallower screen (the Home button of Settings) is a way back, and the
        // workout's minimize is the way down: they slide away like the swipe does, in script, instead of
        // relying on a copy of the old screen being animated by CSS (it never moved on the iPhone).
        const dir = next ? motionDir(here, next, 'PUSH') : 'none'
        if ((dir === 'pop' || dir === 'down') && animateBack(next, step, dir)) return
        step()
      }
      h.go = n => {
        if (!(n < 0)) return
        const step = () => {
          const target = popEntries(-n)
          if (!target) return
          logical.current = 'POP'
          replace(asTo(target.loc), target.loc.state)
        }
        // The swipe marks its own step: it has already been shown.
        const dir = n === -1 && !isGestureMarked() && previousPath() ? motionDir(h.location.pathname, previousPath(), 'POP') : 'none'
        if ((dir === 'pop' || dir === 'down') && animateBack(previousPath(), step, dir)) return
        step()
      }
    }
    historyRef.current = h
  }
  const history = historyRef.current
  const [state, setState] = useState({ action: history.action, location: history.location })
  const last = useRef(history.location.pathname)

  useEffect(() => {
    if (canTransition()) document.documentElement.dataset.vtOk = '1'
    return () => { delete document.documentElement.dataset.vtOk }
  }, [])

  useLayoutEffect(() => history.listen(update => {
    const prev = last.current
    last.current = update.location.pathname
    // In the iOS app every change arrives as a REPLACE; what the app meant by it was noted before.
    const action = logical.current || update.action
    logical.current = null
    const next = { ...update, action }
    // A redirect (REPLACE) is not a screen the user went to; a change of query only is not a new screen.
    // Except the "up one level" a back button falls back on when nothing was left behind
    // (views/Settings.jsx): that one still steps out, as lib/use-screen-motion.js has it.
    const step = motionDir(prev, update.location.pathname, action)
    const dir = action === 'REPLACE' && step !== 'pop' ? 'none' : step
    if (dir === 'none' || !canTransition()) { setState(next); return }
    const root = document.documentElement
    root.dataset.vt = dir
    const t = document.startViewTransition(() => { flushSync(() => setState(next)) })
    const clear = () => { if (root.dataset.vt === dir) delete root.dataset.vt }
    t.finished.then(clear, clear)
  }), [history])

  return <Router location={state.location} navigationType={state.action} navigator={history}>{children}</Router>
}
