// myGym fork: the delta format exists twice, once for the server's gateway (api/fork/) and once for the
// app (frontend/src/fork/), because the web image builds from frontend/ alone. They must stay one file.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = rel => readFileSync(new URL(rel, import.meta.url), 'utf8')

describe('sync-delta.js', () => {
  it('is the same file for the app and the server', () => {
    expect(read('./sync-delta.js')).toBe(read('../../../api/fork/sync-delta.js'))
  })
})
