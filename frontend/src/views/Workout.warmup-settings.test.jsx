// @vitest-environment happy-dom
// A warm-up added in the session, then the exercise's settings saved: the warm-up stays. The sheet
// used to open at the routine's warm-up count (0), and saving it rebuilt the rows from that count,
// so the warm-up nobody had ticked yet was gone (owner's report, 2026-10-22).
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Workout from './Workout.jsx'
import { DEF, useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { isWarmupRow } from '../lib/workout-model.js'

vi.mock('../lib/sound.js', () => ({ beep: vi.fn(), chime: vi.fn(), vibrate: vi.fn(), alertBuzz: vi.fn(), unlock: vi.fn() }))
vi.mock('../lib/api.js', () => ({ api: vi.fn(() => Promise.resolve({})), appBase: () => '/' }))

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const BENCH = '0025'
let root, container, sheetRoot, sheetContainer

function renderTopSheet() {
  if (sheetRoot) act(() => sheetRoot.unmount())
  if (sheetContainer) sheetContainer.remove()
  const sheet = useUI.getState().sheets.at(-1)
  sheetContainer = document.createElement('div')
  document.body.appendChild(sheetContainer)
  sheetRoot = createRoot(sheetContainer)
  act(() => sheetRoot.render(sheet.render(() => useUI.getState().closeSheet(sheet.id))))
  return sheetContainer
}
const openMenu = () => { act(() => container.querySelector('button[aria-label="More"]').click()); return renderTopSheet() }
const menuItem = (menu, label) => [...menu.querySelectorAll('.menu-item')].find(it => it.querySelector('.tt')?.textContent === label)
const sets = () => useStore.getState().S.active.entries[0].sets

beforeEach(() => {
  vi.useFakeTimers()
  localStorage.clear()
  useUI.setState({ sheets: [], toastMsg: '', timer: null, work: null })
  const S = JSON.parse(JSON.stringify(DEF))
  S.routines = [{ id: 'main', name: 'Main', ex: [{ id: BENCH, sets: 2, reps: 8, weight: 60 }] }]
  S.workouts = []
  S.active = {
    id: 'a', d: '2026-10-22', start: Date.now(), routineIds: ['main'], routineId: 'main', name: 'Main', bw: null, cur: 0,
    entries: [{ id: BENCH, rid: 'main', target: { id: BENCH, sets: 2, reps: 8, weight: 60 }, planned: { sets: 2, reps: 8, weight: 60 },
      sets: [{ w: 60, r: 8, done: false }, { w: 60, r: 8, done: false }] }],
  }
  useStore.setState({ S, user: null })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root.render(<MemoryRouter><Workout /></MemoryRouter>))
})
afterEach(() => {
  if (sheetRoot) act(() => sheetRoot.unmount())
  if (sheetContainer) sheetContainer.remove()
  act(() => root.unmount())
  container.remove()
  sheetRoot = null; sheetContainer = null
  useUI.getState().stopRest()
  vi.clearAllTimers()
  vi.useRealTimers()
})

describe('a warm-up added in the session', () => {
  it('stays when the exercise settings are saved unchanged', () => {
    const add = menuItem(openMenu(), 'Add warm-up set')
    act(() => add.click())
    expect(sets().filter(isWarmupRow)).toHaveLength(1)

    const settings = menuItem(openMenu(), 'Exercise settings')
    act(() => settings.click())
    const sheet = renderTopSheet()
    act(() => [...sheet.querySelectorAll('button')].find(b => b.textContent.trim() === 'Save').click())

    expect(sets().filter(isWarmupRow)).toHaveLength(1)
    expect(sets().filter(x => !isWarmupRow(x))).toHaveLength(2)
  })
})
