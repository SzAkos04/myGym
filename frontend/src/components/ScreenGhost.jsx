import { useLayoutEffect, useRef } from 'react'
import { getMotion, isIosApp } from '../lib/screen-motion.js'
import { saveSnapshot } from '../lib/screen-snapshots.js'

// Put inside the keyed #app: when the screen changes, the old one is unmounted at once, which is
// what made switching tabs feel abrupt. As it goes, a picture of it is left behind to fade and slide
// away while the new screen slides in, like the screens of an iOS app. Only a copy: nothing in it
// takes a touch. Skipped under test and for "reduce motion".
export default function ScreenGhost({ path = '' }) {
  const ref = useRef(null)
  useLayoutEffect(() => {
    const el = ref.current?.parentElement
    return () => {
      // The installed iOS app keeps a picture of every screen it leaves, for the swipe back to show under
      // the screen it drags (EdgeSwipeBack.jsx): the system's own snapshot is missing when the page was scrolled.
      if (el && path && import.meta.env.MODE !== 'test' && isIosApp()) {
        const keep = el.cloneNode(true)
        keep.classList.remove('vfade')
        keep.removeAttribute('data-dir')
        keep.style.top = -window.scrollY + 'px'
        saveSnapshot(path, keep)
      }
      // With View Transitions (ViewRouter) the browser animates the old screen itself.
      if (!el || document.documentElement.dataset.vtOk || import.meta.env.MODE === 'test' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
      const dir = getMotion()
      if (dir === 'none' || dir === 'gesture') return
      const wrap = document.createElement('div')
      wrap.className = 'screen-ghost'
      wrap.dataset.dir = dir
      wrap.setAttribute('aria-hidden', 'true')
      const copy = el.cloneNode(true)
      copy.classList.remove('vfade')
      copy.removeAttribute('data-dir')
      copy.style.top = -window.scrollY + 'px'     // where the page was scrolled to when it was left
      wrap.appendChild(copy)
      document.body.appendChild(wrap)
      setTimeout(() => wrap.remove(), 560)
    }
  }, [])
  return <i ref={ref} hidden />
}
