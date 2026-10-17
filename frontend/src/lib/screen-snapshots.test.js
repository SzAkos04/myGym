import { describe, it, expect, beforeEach } from 'vitest'
import { saveSnapshot, getSnapshot, recordPath, pathBefore, resetSnapshots } from './screen-snapshots.js'

beforeEach(resetSnapshots)

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

describe('the path before an entry', () => {
  it('follows the history: a push after a step back drops the entries beyond it', () => {
    recordPath(0, '/home'); recordPath(1, '/settings'); recordPath(2, '/settings/sounds')
    expect(pathBefore(2)).toBe('/settings')
    expect(pathBefore(1)).toBe('/home')
    expect(pathBefore(0)).toBeNull()
    recordPath(2, '/settings/alerts')                    // went back one, then somewhere else
    expect(pathBefore(2)).toBe('/settings')
    expect(pathBefore(3)).toBe('/settings/alerts')
  })
})
