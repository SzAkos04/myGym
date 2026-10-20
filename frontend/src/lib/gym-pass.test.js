import { describe, expect, it } from 'vitest'
import { addDays, cleanPass, daysBetween, passEnd, passHistory, passStatus, renewalDraft, visitsUsed, LAPSED_DAYS } from './gym-pass.js'

const S = (gymPasses, workouts = []) => ({ gymPasses, workouts })
const monthly = (over = {}) => ({ id: 'm', kind: 'time', start: '2026-10-01', days: 30, ...over })
const tenVisits = (over = {}) => ({ id: 'v', kind: 'visits', start: '2026-10-01', visits: 10, ...over })
const wk = (...days) => days.map((d, i) => ({ id: 'w' + i, d }))

describe('dates', () => {
  it('adds and counts days across a DST change and a month end', () => {
    expect(addDays('2026-10-24', 2)).toBe('2026-10-26')
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01')
    expect(daysBetween('2026-10-24', '2026-10-27')).toBe(3)
  })
  it('a 30-day pass from the 1st is good through the 30th; a visit pass ends only if it says so', () => {
    expect(passEnd(monthly())).toBe('2026-10-30')
    expect(passEnd(tenVisits())).toBeNull()
    expect(passEnd(tenVisits({ until: '2026-11-30' }))).toBe('2026-11-30')
  })
})

describe('passStatus', () => {
  it('is quiet with no pass and while a pass is good', () => {
    expect(passStatus(S([]), '2026-10-10').state).toBe('none')
    expect(passStatus({}, '2026-10-10').state).toBe('none')
    const st = passStatus(S([monthly()]), '2026-10-10')
    expect(st).toMatchObject({ state: 'ok', end: '2026-10-30', daysLeft: 20 })
  })

  it('is due within the reminder days, with its own reminder when it has one', () => {
    expect(passStatus(S([monthly()]), '2026-10-26').state).toBe('ok')
    expect(passStatus(S([monthly()]), '2026-10-27')).toMatchObject({ state: 'due', daysLeft: 3 })
    expect(passStatus(S([monthly()]), '2026-10-30')).toMatchObject({ state: 'due', daysLeft: 0 })
    expect(passStatus(S([monthly({ remind: 7 })]), '2026-10-23').state).toBe('due')
    expect(passStatus(S([monthly({ remind: 0 })]), '2026-10-29').state).toBe('ok')
  })

  it('expires the day after its last day, and stops mentioning a pass gone for good', () => {
    expect(passStatus(S([monthly()]), '2026-10-31')).toMatchObject({ state: 'expired', daysLeft: -1 })
    expect(passStatus(S([monthly()]), addDays('2026-10-30', LAPSED_DAYS)).state).toBe('expired')
    expect(passStatus(S([monthly()]), addDays('2026-10-30', LAPSED_DAYS + 1)).state).toBe('none')
  })

  it('a renewal on record silences the old pass, before and after it ends', () => {
    const renewed = [monthly(), monthly({ id: 'n', start: '2026-10-31' })]
    expect(passStatus(S(renewed), '2026-10-28')).toMatchObject({ state: 'ok', pass: { id: 'm' }, next: { id: 'n' } })
    expect(passStatus(S(renewed), '2026-10-31')).toMatchObject({ state: 'ok', pass: { id: 'n' }, next: null })
    // bought ahead, not yet started, the old one long gone: still nothing to say
    expect(passStatus(S([monthly({ id: 'n', start: '2026-12-01' })]), '2026-11-20').state).toBe('ok')
  })

  it('counts a visit pass from the workouts, once a day, plus the days logged by hand', () => {
    const w = wk('2026-09-30', '2026-10-02', '2026-10-02', '2026-10-05', '2026-10-09')
    expect(visitsUsed(tenVisits(), w, '2026-10-20')).toBe(3)
    expect(visitsUsed(tenVisits({ extra: ['2026-10-03', '2026-10-05'] }), w, '2026-10-20')).toBe(4)
    // nothing after today, nothing after the pass's own expiry
    expect(visitsUsed(tenVisits(), w, '2026-10-04')).toBe(1)
    expect(visitsUsed(tenVisits({ until: '2026-10-06' }), w, '2026-10-20')).toBe(2)
  })

  it('is due at two visits left and expired when they are used up', () => {
    const eight = wk('2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07')
    expect(passStatus(S([tenVisits()], eight), '2026-10-08')).toMatchObject({ state: 'ok', visitsLeft: 3, used: 7 })
    expect(passStatus(S([tenVisits({ extra: ['2026-10-08'] })], eight), '2026-10-08')).toMatchObject({ state: 'due', visitsLeft: 2 })
    expect(passStatus(S([tenVisits({ visits: 7 })], eight), '2026-10-08')).toMatchObject({ state: 'expired', visitsLeft: 0 })
    // a visit pass with an expiry is due by date too
    expect(passStatus(S([tenVisits({ until: '2026-10-10' })]), '2026-10-08').state).toBe('due')
  })

  it('remembers a card put off for the due state only until the pass expires', () => {
    expect(passStatus(S([monthly({ later: 'due' })]), '2026-10-28')).toMatchObject({ state: 'due', later: true })
    expect(passStatus(S([monthly({ later: 'due' })]), '2026-10-31')).toMatchObject({ state: 'expired', later: false })
    expect(passStatus(S([monthly({ later: 'expired' })]), '2026-10-31')).toMatchObject({ state: 'expired', later: true })
  })

  it('reads the pass that started last, and skips broken entries', () => {
    const list = [monthly(), null, { id: 'x', start: 'soon' }, monthly({ id: 'old', start: '2026-08-01' })]
    expect(passStatus(S(list), '2026-10-10').pass.id).toBe('m')
    expect(passHistory(S(list)).map(p => p.id)).toEqual(['m', 'old'])
  })
})

describe('renewalDraft', () => {
  it('starts the day after the old pass ends, with the same length, price and reminder', () => {
    expect(renewalDraft(monthly({ price: 14900, cur: 'Ft', remind: 5 }), '2026-10-28'))
      .toEqual({ kind: 'time', start: '2026-10-31', days: 30, price: 14900, cur: 'Ft', remind: 5 })
  })
  it('starts today once the old pass has run out, and carries a visit pass\'s expiry length', () => {
    expect(renewalDraft(monthly(), '2026-11-05').start).toBe('2026-11-05')
    expect(renewalDraft(tenVisits({ until: '2026-11-30' }), '2026-10-20'))
      .toEqual({ kind: 'visits', start: '2026-10-20', visits: 10, until: addDays('2026-10-20', 60) })
  })
  it('gives a first pass sensible defaults', () => {
    expect(renewalDraft(null, '2026-10-20')).toEqual({ kind: 'time', start: '2026-10-20', days: 30 })
  })
})

describe('cleanPass', () => {
  it('keeps what the kind uses, rounds numbers and drops empty fields', () => {
    expect(cleanPass({ id: 'a', kind: 'time', start: '2026-10-20', days: '30', visits: 10, price: '', cur: ' ', remind: '' }))
      .toEqual({ id: 'a', kind: 'time', start: '2026-10-20', days: 30 })
    expect(cleanPass({ id: 'b', kind: 'visits', start: '2026-10-20', visits: 9.6, until: '2026-10-01', price: '12500', cur: 'Ft', remind: 2, extra: ['2026-10-22', '2026-10-21', '2026-10-22'] }))
      .toEqual({ id: 'b', kind: 'visits', start: '2026-10-20', visits: 10, price: 12500, cur: 'Ft', remind: 2, extra: ['2026-10-21', '2026-10-22'] })
  })
})
