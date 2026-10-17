import { describe, it, expect } from 'vitest'
import { tabIndexOf, motionDir } from './screen-motion.js'

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
  it('does nothing on the first screen or for the same one', () => {
    expect(motionDir(null, '/home', 'POP')).toBe('none')
    expect(motionDir('/home', '/home', 'REPLACE')).toBe('none')
  })
})
