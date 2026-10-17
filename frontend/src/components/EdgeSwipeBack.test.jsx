// @vitest-environment happy-dom
import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../lib/screen-motion.js', async () => ({
  ...(await vi.importActual('../lib/screen-motion.js')),
  isIosApp: () => true,
}))

import EdgeSwipeBack from './EdgeSwipeBack.jsx'
import { saveSnapshot, pushEntry, resetSnapshots } from '../lib/screen-snapshots.js'

let root, host
const touch = (type, x) => {
  const ev = new Event(type, { bubbles: true, cancelable: true })
  ev.touches = type === 'touchend' ? [] : [{ clientX: x, clientY: 300 }]
  window.dispatchEvent(ev)
  return ev
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  resetSnapshots()
  document.body.innerHTML = '<div id="app" style="">current</div>'
  Object.defineProperty(window, 'innerWidth', { value: 400, configurable: true })
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => root.render(<MemoryRouter><EdgeSwipeBack /></MemoryRouter>))
})
afterEach(() => { act(() => root.unmount()); document.body.innerHTML = '' })

describe('swipe back from the left edge', () => {
  it('moves the screen with the finger and shows the kept copy of the previous one beneath', () => {
    const copy = document.createElement('div'); copy.id = 'app'; copy.textContent = 'previous'
    saveSnapshot('/settings', copy); pushEntry({ path: '/settings', loc: { pathname: '/settings', search: '', hash: '', state: null } })
    const start = touch('touchstart', 8)
    expect(start.defaultPrevented).toBe(true)                      // the system's own swipe must not start as well
    const app = document.getElementById('app')
    expect(app.style.animation).toBe('none')                       // an animation would outrank the inline transform
    touch('touchmove', 120)
    expect(app.style.transform).toContain('112px')
    expect(document.querySelector('.screen-under')).not.toBeNull()
    expect(document.querySelector('.screen-under').textContent).toBe('previous')
  })

  it('does nothing when the touch is not at the edge, there is no step back, or there is no copy to show', () => {
    const copy = document.createElement('div'); saveSnapshot('/settings', copy)
    expect(touch('touchstart', 8).defaultPrevented).toBe(false)    // no step back yet
    pushEntry({ path: '/settings', loc: { pathname: '/settings', search: '', hash: '', state: null } })
    expect(touch('touchstart', 150).defaultPrevented).toBe(false)  // not at the edge
    resetSnapshots(); pushEntry({ path: '/other', loc: { pathname: '/other', search: '', hash: '', state: null } })
    expect(touch('touchstart', 8).defaultPrevented).toBe(false)    // nothing to show beneath
    expect(document.querySelector('.screen-under')).toBeNull()
  })

  it('springs back and clears the layer when released short of a third of the width', () => {
    vi.useFakeTimers()
    const copy = document.createElement('div'); saveSnapshot('/settings', copy)
    pushEntry({ path: '/settings', loc: { pathname: '/settings', search: '', hash: '', state: null } })
    touch('touchstart', 8); touch('touchmove', 60); touch('touchend')
    act(() => { vi.advanceTimersByTime(400) })
    expect(document.querySelector('.screen-under')).toBeNull()
    expect(document.getElementById('app').style.transform).toBe('')
    vi.useRealTimers()
  })
})
