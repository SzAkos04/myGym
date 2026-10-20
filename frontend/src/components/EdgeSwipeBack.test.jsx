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
import { saveSnapshot, resetSnapshots } from '../lib/screen-snapshots.js'
import { animateBack, pushEntry, resetAppHistory } from '../lib/app-history.js'

let root, host
const touch = (type, x) => {
  const ev = new Event(type, { bubbles: true, cancelable: true })
  ev.touches = type === 'touchend' ? [] : [{ clientX: x, clientY: 300 }]
  window.dispatchEvent(ev)
  return ev
}

// happy-dom has no Web Animations: record what the slide asks for, and hand back something to cancel.
let animated = []
Element.prototype.animate = function (keyframes, opts) { animated.push({ el: this, keyframes, opts }); return { cancel() {} } }
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  resetSnapshots(); resetAppHistory()
  document.body.innerHTML = '<div id="app" style="">current</div>'
  Object.defineProperty(window, 'innerWidth', { value: 400, configurable: true })
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => root.render(<MemoryRouter initialEntries={['/settings/sounds']}><EdgeSwipeBack /></MemoryRouter>))
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
    resetSnapshots(); resetAppHistory(); pushEntry({ path: '/other', loc: { pathname: '/other', search: '', hash: '', state: null } })
    expect(touch('touchstart', 8).defaultPrevented).toBe(false)    // nothing to show beneath
    expect(document.querySelector('.screen-under')).toBeNull()
  })

  it('leaves a tap on a control at the edge to that control: the back button\'s chevron sits there', () => {
    const copy = document.createElement('div'); saveSnapshot('/settings', copy)
    pushEntry({ path: '/settings', loc: { pathname: '/settings', search: '', hash: '', state: null } })
    const back = document.createElement('button'); back.innerHTML = '<span>‹ Settings</span>'
    document.body.appendChild(back)
    const ev = new Event('touchstart', { bubbles: true, cancelable: true })
    ev.touches = [{ clientX: 14, clientY: 40 }]
    back.querySelector('span').dispatchEvent(ev)
    expect(ev.defaultPrevented).toBe(false)                        // the click goes through
    expect(document.querySelector('.screen-under')).toBeNull()
  })

  it('slides with Web Animations, which no CSS animation left on the screen can hold still', () => {
    vi.useFakeTimers()
    const copy = document.createElement('div'); saveSnapshot('/settings', copy)
    pushEntry({ path: '/settings', loc: { pathname: '/settings', search: '', hash: '', state: null } })
    touch('touchstart', 8); touch('touchmove', 60); touch('touchend')
    const app = document.getElementById('app')
    const slide = animated.find(a => a.el === app)
    expect(slide.keyframes[0].transform).toContain('52px')        // from where the finger left it
    expect(slide.keyframes.at(-1).transform).toContain('(0px')     // back to rest
    expect(slide.opts.duration).toBe(280)
    act(() => { vi.advanceTimersByTime(400) })
    vi.useRealTimers()
  })

  it('a slide started by a button plays through a touchend that arrives after the click', () => {
    vi.useFakeTimers()
    const copy = document.createElement('div'); saveSnapshot('/settings', copy)
    let stepped = 0
    expect(animateBack('/settings', () => { stepped++ }, 'pop')).toBe(true)
    act(() => { vi.advanceTimersByTime(40) })                      // two frames: the slide is under way
    touch('touchend')                                              // the tap that pressed the button, late
    act(() => { vi.advanceTimersByTime(400) })
    expect(stepped).toBe(1)                                        // it went back, it did not spring back
    vi.useRealTimers()
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

  it('does not start on a tab\'s own screen, where there is nothing to go back to', () => {
    act(() => root.render(<MemoryRouter key="plan" initialEntries={['/plan']}><EdgeSwipeBack /></MemoryRouter>))
    const copy = document.createElement('div'); saveSnapshot('/home', copy)
    pushEntry({ path: '/home', loc: { pathname: '/home', search: '', hash: '', state: null } })
    expect(touch('touchstart', 8).defaultPrevented).toBe(false)
    expect(document.querySelector('.screen-under')).toBeNull()
  })
})
