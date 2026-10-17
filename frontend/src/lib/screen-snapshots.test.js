import { describe, it, expect, beforeEach } from 'vitest'
import { saveSnapshot, getSnapshot, resetSnapshots } from './screen-snapshots.js'
import { pushEntry, popEntries, entryCount, previousPath, resetAppHistory } from './app-history.js'

beforeEach(() => { resetSnapshots(); resetAppHistory() })

describe('screen copies', () => {
  it('keeps the last few and hands back the one asked for', () => {
    const nodes = ['/a', '/b', '/c', '/d', '/e'].map(p => ({ p }))
    nodes.forEach(n => saveSnapshot(n.p, n))
    expect(getSnapshot('/a')).toBeNull()               // the oldest of five went
    expect(getSnapshot('/e')).toBe(nodes[4])
    saveSnapshot('/b', { p: '/b2' })
    expect(getSnapshot('/b')).toEqual({ p: '/b2' })     // a screen visited again replaces its copy
  })
  it('ignores a missing path or node', () => {
    saveSnapshot('', {}); saveSnapshot('/a', null)
    expect(getSnapshot('/a')).toBeNull()
  })
})

describe('the app\'s own history', () => {
  const e = path => ({ path, loc: { pathname: path, search: '', hash: '', state: null } })
  it('puts the screen left behind on a stack and takes entries off on a step back', () => {
    pushEntry(e('/home')); pushEntry(e('/settings'))
    expect(entryCount()).toBe(2)
    expect(previousPath()).toBe('/settings')
    expect(popEntries(1).path).toBe('/settings')        // one step back lands on the screen left last
    expect(entryCount()).toBe(1)
    expect(previousPath()).toBe('/home')
  })
  it('steps back several at once, never past the first, and says so when there is nothing', () => {
    pushEntry(e('/home')); pushEntry(e('/settings')); pushEntry(e('/settings/sounds'))
    expect(popEntries(2).path).toBe('/settings')
    expect(popEntries(5).path).toBe('/home')
    expect(entryCount()).toBe(0)
    expect(popEntries(1)).toBeNull()
    expect(previousPath()).toBeNull()
  })
  it('does not grow without end', () => {
    for (let i = 0; i < 100; i++) pushEntry(e('/p' + i))
    expect(entryCount()).toBe(60)
    expect(previousPath()).toBe('/p99')
  })
})
