import { describe, it, expect } from 'vitest'
import { cloudState, fmtPing } from './sync-cloud.js'

describe('cloudState', () => {
  it('shows nothing without a server: a phone kept local or a guest chose that', () => {
    expect(cloudState({ tone: 'quiet', status: 'local' })).toBeNull()
    expect(cloudState({})).toBeNull()
  })

  it('follows the connection view', () => {
    expect(cloudState({ tone: 'ok', status: 'ok' })).toBe('ok')
    expect(cloudState({ tone: 'off', status: 'offline' })).toBe('off')
    expect(cloudState({ tone: 'bad', status: 'error' })).toBe('bad')
    expect(cloudState({ tone: 'bad', status: 'auth' })).toBe('bad')
    expect(cloudState({ tone: 'wait', status: 'held' })).toBe('wait')
  })

  it('a change in its short debounce reads as synced until the grace period is over', () => {
    expect(cloudState({ tone: 'wait', status: 'pending' })).toBe('ok')
    expect(cloudState({ tone: 'wait', status: 'pending', pendingWaited: true })).toBe('wait')
  })

  it('turns while a sync is out, but only over a connection that works', () => {
    expect(cloudState({ tone: 'ok', status: 'ok', busy: true })).toBe('sync')
    expect(cloudState({ tone: 'wait', status: 'pending', busy: true })).toBe('sync')
    expect(cloudState({ tone: 'off', status: 'offline', busy: true })).toBe('off')
    expect(cloudState({ tone: 'bad', status: 'error', busy: true })).toBe('bad')
  })
})

describe('fmtPing', () => {
  it('rounds to whole milliseconds, never 0', () => {
    expect(fmtPing(37.6)).toBe('38 ms')
    expect(fmtPing(0.2)).toBe('1 ms')
  })
})
