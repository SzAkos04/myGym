import { useLayoutEffect, useRef } from 'react'
import { getMotion } from '../lib/screen-motion.js'

// Put inside the keyed #app: when the screen changes, the old one is unmounted at once, which is
// what made switching tabs feel abrupt. As it goes, a picture of it is left behind to fade and slide
// away while the new screen slides in, like the screens of an iOS app. Only a copy: nothing in it
// takes a touch. Skipped under test and for "reduce motion".
export default function ScreenGhost() {
  const ref = useRef(null)
  useLayoutEffect(() => {
    const el = ref.current?.parentElement
    return () => {
      if (!el || import.meta.env.MODE === 'test' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
      const dir = getMotion()
      if (dir === 'none') return
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
      setTimeout(() => wrap.remove(), 260)
    }
  }, [])
  return <i ref={ref} hidden />
}
