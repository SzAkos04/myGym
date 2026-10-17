import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8')

describe('the leaving screen\'s copy (.screen-ghost)', () => {
  it('lets its own #app animate: only what is inside it is frozen', () => {
    // `.screen-ghost *` matches the copy's #app too, and animation:none!important beats the slide it is given.
    expect(css).not.toMatch(/\.screen-ghost\s\*\s*\{[^}]*animation:\s*none/)
    expect(css).toMatch(/\.screen-ghost>#app \*\s*\{[^}]*animation:\s*none!important/)
  })

  it('slides out in every direction that has one', () => {
    for (const dir of ['tab', 'push', 'up', 'pop', 'down']) {
      expect(css, dir).toMatch(new RegExp(`\\.screen-ghost\\[data-dir="${dir}"\\]>#app\\s*\\{animation-name:`))
    }
  })
})
