// @vitest-environment happy-dom
import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot } from 'react-dom/client'
import { useLocation, useNavigate, useNavigationType } from 'react-router-dom'

vi.mock('./screen-motion.js', async () => ({
  ...(await vi.importActual('./screen-motion.js')),
  isIosApp: () => true,
}))

import ViewRouter from '../components/ViewRouter.jsx'
import { useScreenMotion } from './use-screen-motion.js'
import { resetSnapshots, saveSnapshot } from './screen-snapshots.js'
import { resetAppHistory, setBackAnimator } from './app-history.js'

let root, host, nav, seen
function Probe() {
  const loc = useLocation()
  const type = useNavigationType()
  nav = useNavigate()
  seen = { path: loc.pathname, dir: useScreenMotion(loc.pathname, type), type }
  return null
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  resetSnapshots(); resetAppHistory()
  window.location.hash = '#/home'
  host = document.createElement('div'); document.body.appendChild(host)
  root = createRoot(host)
  act(() => root.render(<ViewRouter><Probe /></ViewRouter>))
})
afterEach(() => { act(() => root.unmount()); host.remove() })

const go = (...args) => act(() => { nav(...args) })

describe('screen direction in the installed iOS app (the app\'s own history)', () => {
  it('pushes into a screen and pops back out of it, by button or by stepping back', () => {
    go('/settings');           expect(seen).toMatchObject({ path: '/settings', dir: 'push' })
    go('/settings/workout');   expect(seen).toMatchObject({ path: '/settings/workout', dir: 'push' })
    go(-1);                    expect(seen).toMatchObject({ path: '/settings', dir: 'pop', type: 'POP' })
    go('/home');               expect(seen).toMatchObject({ path: '/home', dir: 'pop' })   // the Home button on Settings
  })

  it('cross-fades between tabs and leaves no step back behind', () => {
    go('/plan');               expect(seen).toMatchObject({ path: '/plan', dir: 'tab' })
    go('/stats');              expect(seen).toMatchObject({ path: '/stats', dir: 'tab' })
    go('/history');            expect(seen).toMatchObject({ path: '/history', dir: 'push' })
    go(-1);                    expect(seen).toMatchObject({ path: '/stats', dir: 'pop' })
  })

  it('a redirect (replace) is not a screen the user went to', () => {
    go('/settings')
    go('/settings/workout', { replace: true })
    expect(seen).toMatchObject({ path: '/settings/workout', dir: 'none' })
  })

  it('"up one level" by replace (the back button with nothing behind it) still steps out', () => {
    window.location.hash = '#/settings/workout'
    go('/settings/workout', { replace: true })
    go('/settings', { replace: true })
    expect(seen).toMatchObject({ path: '/settings', dir: 'pop' })
  })
})


describe('the back and Home buttons use the swipe\'s slide (EdgeSwipeBack registers it)', () => {
  const animator = () => {
    const calls = []
    setBackAnimator((dest, proceed, kind) => { calls.push(dest + ':' + kind); animator.proceed = proceed; return true })
    return calls
  }

  it('waits for the slide before stepping back, and steps once it is done', () => {
    go('/settings'); go('/settings/workout')
    saveSnapshot('/settings', document.createElement('div'))
    const calls = animator()
    go(-1)
    expect(calls).toEqual(['/settings:pop'])
    expect(seen.path).toBe('/settings/workout')                 // not yet: the slide runs first
    act(() => animator.proceed())
    expect(seen).toMatchObject({ path: '/settings', type: 'POP' })
  })

  it('the Home button of Settings slides away too; going deeper does not', () => {
    go('/settings')
    saveSnapshot('/home', document.createElement('div'))
    const calls = animator()
    go('/settings/workout'); expect(seen.path).toBe('/settings/workout')   // deeper: no slide of the back kind
    go(-1); calls.length = 0
    go('/home')
    expect(calls).toEqual(['/home:pop'])
    act(() => animator.proceed())
    expect(seen.path).toBe('/home')
  })

  it('leaving the workout sinks it: the same slide as going up, the other way', () => {
    go('/workout')
    saveSnapshot('/home', document.createElement('div'))
    const calls = animator()
    go('/home')                                                 // "Minimize" and "Discard" both end here
    expect(calls).toEqual(['/home:down'])
    expect(seen.path).toBe('/workout')
    act(() => animator.proceed())
    expect(seen.path).toBe('/home')
  })

  it('goes straight there when the animator has nothing to show', () => {
    go('/settings'); go('/settings/workout')
    setBackAnimator(() => false)
    go(-1)
    expect(seen).toMatchObject({ path: '/settings', dir: 'pop' })
  })
})
