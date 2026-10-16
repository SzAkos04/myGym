import { describe, it, expect } from 'vitest'
import { setupChips, hasSetting } from './setup-note.js'

describe('setupChips', () => {
  it('splits on dots, semicolons and new lines and drops empties', () => {
    expect(setupChips('Seat 4 · Back 2; Pin 7\nkeep elbows in')).toEqual(['Seat 4', 'Back 2', 'Pin 7', 'keep elbows in'])
    expect(setupChips('  ·  ')).toEqual([])
  })
  it('copes with non-strings and caps the count', () => {
    expect(setupChips(null)).toEqual([])
    expect(setupChips(Array.from({ length: 20 }, (_, i) => 'a' + i).join(' · '))).toHaveLength(8)
  })
})

describe('hasSetting', () => {
  it('finds a piece by its label, with or without a value, and not by a longer word', () => {
    expect(hasSetting('Seat 4 · Back 2', 'back')).toBe(true)
    expect(hasSetting('Seat', 'Seat')).toBe(true)
    expect(hasSetting('Seatbelt on', 'Seat')).toBe(false)
    expect(hasSetting('', 'Seat')).toBe(false)
  })
})
