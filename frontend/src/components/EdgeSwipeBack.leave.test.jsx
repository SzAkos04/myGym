// @vitest-environment happy-dom
import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot } from 'react-dom/client'
import { useLocation, useNavigate } from 'react-router-dom'

vi.mock('../lib/screen-motion.js', async () => ({
  ...(await vi.importActual('../lib/screen-motion.js')),
  isIosApp: () => true,
}))

import ViewRouter from './ViewRouter.jsx'
import EdgeSwipeBack from './EdgeSwipeBack.jsx'
import { resetSnapshots, saveSnapshot, saveTabBar } from '../lib/screen-snapshots.js'
import { resetAppHistory } from '../lib/app-history.js'

let root, host, nav
// What App.jsx's Shell does around the screen: the keyed #app and the swipe. The workout has no tab bar.
function Shell() {
  const loc = useLocation()
  nav = useNavigate()
  return <>
    <div id="app" key={loc.pathname} data-path={loc.pathname} />
    <EdgeSwipeBack />
  </>
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  vi.useFakeTimers()
  resetSnapshots(); resetAppHistory()
  window.location.hash = '#/home'
  host = document.createElement('div'); document.body.appendChild(host)
  root = createRoot(host)
  act(() => root.render(<ViewRouter><Shell /></ViewRouter>))
})
afterEach(() => { act(() => root.unmount()); host.remove(); vi.useRealTimers() })

describe('minimizing the workout in the installed iOS app', () => {
  it('sinks the screen over Home and its tab bar, and only then changes the route', () => {
    act(() => { nav('/workout') })
    saveSnapshot('/home', document.createElement('div'))
    const bar = document.createElement('nav'); bar.id = 'tabbar'
    saveTabBar([bar])
    const app = document.getElementById('app')
    act(() => { nav('/home') })
    // The slide has started and a re-render for the tab bar did not stop it
    expect(document.getElementById('app')).toBe(app)
    expect(app.style.transform).toMatch(/translate3d\(0(px)?,\s*\d+px/)
    expect(app.style.transition).toContain('transform')
    // the copy of the tab bar lies on the picture beneath, not over the sliding screen
    expect(document.querySelector('.screen-under #tabbar')).not.toBeNull()
    expect(app.dataset.path).toBe('/workout')
    act(() => { vi.advanceTimersByTime(300) })
    expect(document.getElementById('app').dataset.path).toBe('/home')
    act(() => { vi.advanceTimersByTime(100) })
    expect(document.querySelector('.screen-under')).toBeNull()
  })
})
