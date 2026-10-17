// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import SyncCloud from './SyncCloud.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

/* The cloud beside the Settings gear on Home: quiet while synced, turning while a sync has been
   out for a moment, crossed out when the server is down or says no, absent without a server. A tap
   opens the panel: the server, the numbers, and the one thing to do. The store is a stand-in. */
const mocks = vi.hoisted(() => {
  const state = { MOBILE: false, DEMO: false, webauthn: true, user: null, guest: false, onboarding: false, sync: null, S: {}, sheets: [], navs: [] }
  state.toast = vi.fn()
  state.health = vi.fn(async () => ({ ok: true }))
  state.unsynced = vi.fn(() => ({ owed: false, count: 0 }))
  state.syncNow = vi.fn(async () => state.sync)
  state.passkeyLogin = vi.fn(async () => ({ id: 'u1', name: 'andi' }))
  state.update = vi.fn(mut => { state.S = { ...state.S }; mut(state.S) })
  state.snapshot = () => ({
    S: state.S, user: state.user, sync: state.sync, needsMobileOnboarding: state.onboarding,
    isGuest: () => state.guest, syncNow: state.syncNow, update: state.update, unsyncedChanges: state.unsynced,
    setUser: vi.fn(), adoptProfile: vi.fn(async () => ({})),
  })
  return state
})
vi.mock('../store/useStore.js', () => {
  const useStore = selector => selector ? selector(mocks.snapshot()) : mocks.snapshot()
  useStore.getState = mocks.snapshot
  return { useStore }
})
vi.mock('../store/useUI.js', () => {
  const snap = () => ({ toast: (...a) => mocks.toast(...a), openSheet: (render, opts) => { mocks.sheets.push({ render, opts }); return {} } })
  const useUI = selector => selector ? selector(snap()) : snap()
  useUI.getState = snap
  return { useUI }
})
vi.mock('react-router-dom', () => ({ useNavigate: () => to => mocks.navs.push(to) }))
vi.mock('../lib/mobile.js', () => ({ get MOBILE() { return mocks.MOBILE } }))
vi.mock('../lib/demo.js', () => ({ get DEMO() { return mocks.DEMO } }))
vi.mock('../lib/api.js', () => ({ api: (...a) => mocks.health(...a), webauthnOK: () => mocks.webauthn, passkeyLogin: (...a) => mocks.passkeyLogin(...a) }))
vi.mock('../sheets.jsx', () => ({ askAddDeviceData: vi.fn() }))
// What the connect sheet was opened with is the point; its own form is tested elsewhere.
vi.mock('../views/MobileOnboarding.jsx', () => ({ ConnectSheet: props => <div className="connect" data-url={props.initialUrl ?? ''} data-again={String(!!props.again)} /> }))

const BASE = 'https://gym.example.com'
const sync = (status, extra = {}) => ({ status, offline: false, pending: false, auth: false, lastError: null, lastSynced: 0, server: BASE, ...extra })

// Whether the device has a network (navigator.onLine), and the event that says it changed.
const network = on => {
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => on })
  window.dispatchEvent(new Event(on ? 'online' : 'offline'))
}

let host, root
beforeEach(() => {
  network(true)
  Object.assign(mocks, { MOBILE: false, DEMO: false, webauthn: true, user: { id: 'u1', name: 'andi' }, guest: false, onboarding: false, sync: sync('ok'), S: {} })
  mocks.sheets.length = 0
  mocks.navs.length = 0
  mocks.toast.mockClear(); mocks.syncNow.mockClear(); mocks.health.mockClear(); mocks.passkeyLogin.mockClear(); mocks.update.mockClear()
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.useRealTimers()
})

const render = () => act(() => root.render(<SyncCloud />))
const cloud = () => host.querySelector('.sync-cloud')
const pop = () => document.body.querySelector('.sync-pop')

describe('SyncCloud', () => {
  it('is a quiet cloud with a tick while everything is synced', () => {
    render()
    expect(cloud().className).toContain('ok')
    expect(cloud().getAttribute('aria-label')).toContain('All synced')
  })

  it('is not there without a server, with the indicator switched off, or in the demo', () => {
    mocks.user = null; mocks.sync = sync('local'); render()
    expect(cloud()).toBeNull()
    mocks.user = { id: 'u1', name: 'andi' }; mocks.sync = sync('ok'); mocks.S = { connStatus: false }; render()
    expect(cloud()).toBeNull()
    mocks.S = {}; mocks.DEMO = true; render()
    expect(cloud()).toBeNull()
  })

  it('is crossed out when the server cannot be reached or answers with an error', () => {
    mocks.sync = sync('offline', { offline: true, lastError: { status: 0, code: 'network' } }); render()
    expect(cloud().className).toContain('off')
    mocks.sync = sync('error', { lastError: { status: 502, code: 'http' } }); render()
    expect(cloud().className).toContain('bad')
  })

  it('turns only once a sync has been out for a moment', () => {
    vi.useFakeTimers()
    mocks.sync = sync('ok', { busy: true }); render()
    expect(cloud().classList.contains('sync')).toBe(false)
    act(() => { vi.advanceTimersByTime(350) })
    expect(cloud().classList.contains('sync')).toBe(true)
  })

  it('opens the panel: the server, one response-time check, Sync now and Settings', async () => {
    mocks.sync = sync('ok', { lastSynced: Date.now() - 120000 }); render()
    await act(async () => { cloud().click() })
    expect(pop()).not.toBeNull()
    expect(pop().textContent).toContain('gym.example.com')
    expect(mocks.health).toHaveBeenCalledTimes(1)
    expect(pop().textContent).toMatch(/\d+ ms/)
    await act(async () => { pop().querySelector('.btn.primary').click() })
    expect(mocks.syncNow).toHaveBeenCalledTimes(1)
    await act(async () => { [...pop().querySelectorAll('.btn')].pop().click() })
    expect(mocks.navs).toEqual(['/settings/account'])
    expect(pop()).toBeNull()
  })

  it('says when the server does not answer, and offers the fix for the state it is in', async () => {
    mocks.health.mockImplementationOnce(async () => { throw new Error('down') })
    mocks.sync = sync('offline', { offline: true, pending: true, lastError: { status: 0, code: 'network' } }); render()
    await act(async () => { cloud().click() })
    expect(pop().textContent).toContain('No answer')
    expect(pop().querySelector('.btn.primary').textContent).toBe('Try again')
  })

  it('the panel follows the cloud when the bar at the top pushes the page down', async () => {
    let top = 60
    mocks.sync = sync('ok'); render()
    cloud().getBoundingClientRect = () => ({ top, bottom: top + 36, right: 380, left: 344, width: 36, height: 36 })
    await act(async () => { cloud().click() })
    await act(async () => { await new Promise(r => setTimeout(r, 40)) })
    const before = parseInt(pop().style.top, 10)
    top = 100                                                   // the connection bar slid in above the page
    await act(async () => { await new Promise(r => setTimeout(r, 60)) })
    expect(parseInt(pop().style.top, 10)).toBe(before + 40)
  })
})
