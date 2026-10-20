// @vitest-environment happy-dom
// myGym: History draws its rows 40 at a time and adds the next 40 as the end of the list comes near.
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ S: null }))
vi.mock('../store/useStore.js', () => ({ useStore: selector => selector({ S: mocks.S }) }))
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }))
vi.mock('../sheets.jsx', () => ({
  WorkoutRow: ({ w }) => React.createElement('div', { className: 'item', 'data-id': w.id }),
  DayNoteRow: () => null, workoutDetailSheet: vi.fn(), logPastWorkoutSheet: vi.fn(),
}))

import History from './History.jsx'

const workouts = Array.from({ length: 50 }, (_, i) => ({ id: 'w' + i, d: `2026-${String(1 + (i % 9)).padStart(2, '0')}-${String(1 + (i % 27)).padStart(2, '0')}`, entries: [] }))
let host, root, seen
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  mocks.S = { workouts, dayNotes: {} }
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host)
})
afterEach(() => { act(() => root.unmount()); host.remove(); vi.unstubAllGlobals() })
const rows = () => host.querySelectorAll('.list > .item').length

it('draws the first 40 rows, then the rest once the end of the list comes into view', () => {
  vi.stubGlobal('IntersectionObserver', class { constructor(cb) { seen = cb } observe() {} disconnect() {} })
  act(() => root.render(<History />))
  expect(rows()).toBe(40)
  act(() => seen([{ isIntersecting: true }]))
  expect(rows()).toBe(50)
})

it('draws every row at once where nothing can watch the scrolling', () => {
  vi.stubGlobal('IntersectionObserver', undefined)
  act(() => root.render(<History />))
  expect(rows()).toBe(50)
})
