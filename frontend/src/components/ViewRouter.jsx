import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { Router, UNSAFE_createHashHistory as createHashHistory } from 'react-router-dom'
import { motionDir, isBrowserBackGesture, markGesture, isIosApp } from '../lib/screen-motion.js'
import { pushEntry, popEntries } from '../lib/screen-snapshots.js'

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
const IOS = typeof navigator !== 'undefined'
  && (/iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1))
const standalone = () => !!(window.navigator.standalone || window.matchMedia?.('(display-mode: standalone)').matches)

const canTransition = () => typeof document !== 'undefined' && typeof document.startViewTransition === 'function'
  && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  && !isIosApp()

const asTo = loc => ({ pathname: loc.pathname, search: loc.search, hash: loc.hash })

export default function ViewRouter({ children }) {
  const historyRef = useRef(null)
  const logical = useRef(null)          // what the app itself is doing in the iOS app: 'PUSH' or 'POP'
  const ownPopAt = useRef(0)
  if (historyRef.current == null) {
    const h = createHashHistory({ v5Compat: true })
    if (isIosApp()) {
      const replace = h.replace.bind(h)
      h.push = (to, state) => {
        pushEntry({ path: h.location.pathname, loc: h.location })
        logical.current = 'PUSH'
        replace(to, state)
      }
      h.go = n => {
        if (!(n < 0)) return
        const target = popEntries(-n)
        if (!target) return
        ownPopAt.current = Date.now()
        logical.current = 'POP'
        replace(asTo(target.loc), target.loc.state)
      }
    } else {
      // Remember when the app itself steps back (navigate(-1) calls this): a pop that arrives without
      // one is the browser's back gesture, which iOS has already animated.
      const go = h.go.bind(h)
      h.go = n => { ownPopAt.current = Date.now(); go(n) }
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
    const dir = action === 'REPLACE' ? 'none' : motionDir(prev, update.location.pathname, action)
    // The browser's own back swipe has already animated this change: no second animation on top of it.
    const gesture = dir !== 'none' && isBrowserBackGesture({
      action, ios: IOS, standalone: standalone(), sinceOwnMs: ownPopAt.current ? Date.now() - ownPopAt.current : Infinity,
    })
    if (gesture) markGesture()
    if (dir === 'none' || gesture || !canTransition()) { setState(next); return }
    const root = document.documentElement
    root.dataset.vt = dir
    const t = document.startViewTransition(() => { flushSync(() => setState(next)) })
    const clear = () => { if (root.dataset.vt === dir) delete root.dataset.vt }
    t.finished.then(clear, clear)
  }), [history])

  return <Router location={state.location} navigationType={state.action} navigator={history}>{children}</Router>
}
