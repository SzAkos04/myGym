import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { Router, UNSAFE_createHashHistory as createHashHistory } from 'react-router-dom'
import { motionDir, isBrowserBackGesture } from '../lib/screen-motion.js'

// A hash router whose screen changes run inside a View Transition (document.startViewTransition),
// so the browser snapshots the old screen and the new one and animates between the two on the GPU,
// the way iOS pushes, pops and cross-fades its screens (the CSS is in index.css, keyed on
// html[data-vt]). The declarative HashRouter has no hook for this, so the history is ours.
//
// Browsers without the API (and "reduce motion", and the tests) just swap the screen: the older
// DOM-copy animation in App.jsx / ScreenGhost.jsx covers the former, html[data-vt-ok] switches it off.
const canTransition = () => typeof document !== 'undefined' && typeof document.startViewTransition === 'function'
  && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

const IOS = typeof navigator !== 'undefined'
  && (/iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1))
const standalone = () => !!(window.navigator.standalone || window.matchMedia?.('(display-mode: standalone)').matches)

export default function ViewRouter({ children }) {
  const historyRef = useRef(null)
  if (historyRef.current == null) {
    const h = createHashHistory({ v5Compat: true })
    // Remember when the app itself steps back (navigate(-1) calls this): a pop that arrives without
    // one is the browser's back gesture, which iOS has already animated.
    const go = h.go.bind(h)
    h.go = n => { ownPopAt.current = Date.now(); go(n) }
    historyRef.current = h
  }
  const history = historyRef.current
  const [state, setState] = useState({ action: history.action, location: history.location })
  const last = useRef(history.location.pathname)
  const ownPopAt = useRef(0)

  useEffect(() => {
    if (canTransition()) document.documentElement.dataset.vtOk = '1'
    return () => { delete document.documentElement.dataset.vtOk }
  }, [])

  useLayoutEffect(() => history.listen(update => {
    const prev = last.current
    last.current = update.location.pathname
    // A redirect (REPLACE) is not a screen the user went to; a change of query only is not a new screen.
    const dir = update.action === 'REPLACE' ? 'none' : motionDir(prev, update.location.pathname, update.action)
    const gesture = isBrowserBackGesture({
      action: update.action, ios: IOS, standalone: standalone(), sinceOwnMs: ownPopAt.current ? Date.now() - ownPopAt.current : Infinity,
    })
    if (dir === 'none' || gesture || !canTransition()) { setState(update); return }
    const root = document.documentElement
    root.dataset.vt = dir
    const t = document.startViewTransition(() => { flushSync(() => setState(update)) })
    const clear = () => { if (root.dataset.vt === dir) delete root.dataset.vt }
    t.finished.then(clear, clear)
  }), [history])

  return <Router location={state.location} navigationType={state.action} navigator={history}>{children}</Router>
}
