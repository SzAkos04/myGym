import { describe, it, expect } from 'vitest'
import { tabIndexOf, motionDir, depthOf, isBrowserBackGesture } from './screen-motion.js'

describe('tabIndexOf', () => {
  it('puts the sub-screens under the tab the bar highlights for them', () => {
    expect(tabIndexOf('/home')).toBe(0)
    expect(tabIndexOf('/settings/appearance')).toBe(0)
    expect(tabIndexOf('/plan/r/abc')).toBe(1)
    expect(tabIndexOf('/history')).toBe(2)
    expect(tabIndexOf('/structural-balance')).toBe(2)
    expect(tabIndexOf('/muscles')).toBe(3)
    expect(tabIndexOf('/')).toBe(0)
  })
  it('has none for the screens that belong to no tab', () => {
    expect(tabIndexOf('/workout')).toBeNull()
    expect(tabIndexOf('/coach/setup')).toBeNull()
    expect(tabIndexOf('/admin')).toBeNull()
  })
})

describe('depthOf', () => {
  it('is 0 for a tab\'s own screen and one more per level', () => {
    expect(depthOf('/home')).toBe(0)
    expect(depthOf('/')).toBe(0)
    expect(depthOf('/stats')).toBe(0)
    expect(depthOf('/settings')).toBe(1)
    expect(depthOf('/settings/sounds')).toBe(2)
    expect(depthOf('/history')).toBe(1)
    expect(depthOf('/plan/r/abc')).toBe(3)
  })
})

describe('motionDir', () => {
  it('cross-fades between tabs, whichever way', () => {
    expect(motionDir('/home', '/stats', 'PUSH')).toBe('tab')
    expect(motionDir('/library', '/plan', 'PUSH')).toBe('tab')
    expect(motionDir('/history', '/library', 'PUSH')).toBe('tab')   // History is under Stats
  })
  it('pushes into a screen and pops back out of it', () => {
    expect(motionDir('/stats', '/history', 'PUSH')).toBe('push')
    expect(motionDir('/history', '/stats', 'POP')).toBe('pop')
    expect(motionDir('/home', '/settings', 'PUSH')).toBe('push')
    expect(motionDir('/plan', '/plan/r/abc', 'PUSH')).toBe('push')
    expect(motionDir('/coach', '/coach/setup', 'PUSH')).toBe('push')
  })
  it('raises the workout like a modal and lowers it again', () => {
    expect(motionDir('/home', '/workout', 'PUSH')).toBe('up')
    expect(motionDir('/workout', '/home', 'PUSH')).toBe('down')
    expect(motionDir('/workout', '/stats', 'POP')).toBe('down')
  })
  it('pops when a plain navigation goes up a level, like the Home button on Settings', () => {
    expect(motionDir('/settings', '/home', 'PUSH')).toBe('pop')
    expect(motionDir('/settings/sounds', '/settings', 'PUSH')).toBe('pop')
    expect(motionDir('/history', '/stats', 'PUSH')).toBe('pop')
    expect(motionDir('/plan/r/abc', '/plan', 'PUSH')).toBe('pop')
    expect(motionDir('/settings/sounds', '/home', 'PUSH')).toBe('pop')
    expect(motionDir('/home', '/settings/sounds', 'PUSH')).toBe('push')
  })
  it('does nothing on the first screen or for the same one', () => {
    expect(motionDir(null, '/home', 'POP')).toBe('none')
    expect(motionDir('/home', '/home', 'REPLACE')).toBe('none')
  })
})

describe('isBrowserBackGesture', () => {
  const base = { action: 'POP', ios: true, standalone: true, sinceOwnMs: Infinity }
  it('is the installed iOS app stepping back on its own: the swipe from the left edge', () => {
    expect(isBrowserBackGesture(base)).toBe(true)
  })
  it('is not when the app asked for the step itself, however it got there', () => {
    expect(isBrowserBackGesture({ ...base, sinceOwnMs: 80 })).toBe(false)
    expect(isBrowserBackGesture({ ...base, sinceOwnMs: 5000 })).toBe(true)
  })
  it('is not anywhere the browser has no such gesture to animate', () => {
    expect(isBrowserBackGesture({ ...base, ios: false })).toBe(false)
    expect(isBrowserBackGesture({ ...base, standalone: false })).toBe(false)
    expect(isBrowserBackGesture({ ...base, action: 'PUSH' })).toBe(false)
  })
})
