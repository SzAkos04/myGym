#!/usr/bin/env node
// The tests that a change can affect, and only those: vitest's --changed follows the import graph
// from the files git reports as changed. The whole suite is 400+ files; a change usually reaches a
// few dozen, and on a small machine that is minutes instead of most of an hour.
//
//   npm run test:changed                  # against the last commit (what is not committed yet)
//   npm run test:changed -- origin/custom # against a branch or commit: everything since it
//
// Node 25+ ships a localStorage of its own that needs a file to live in, and without one the
// stores in the tests see a broken one; a throwaway file under the OS temp dir is given here.
// The files run one after another: a few hundred MB each, and parallel runs have run out of memory
// on a WSL with under 2 GB. The full suite runs on GitHub on every push (.github/workflows/mygym-test.yml).
import { spawnSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const base = process.argv[2]
const args = ['vitest', 'run', base ? `--changed=${base}` : '--changed', '--no-file-parallelism', '--testTimeout=60000', '--passWithNoTests', ...process.argv.slice(3)]
const env = { ...process.env }
if (Number(process.versions.node.split('.')[0]) >= 25) {
  const file = join(mkdtempSync(join(tmpdir(), 'vitest-ls-')), 'ls.json')
  env.NODE_OPTIONS = [env.NODE_OPTIONS, `--localstorage-file=${file}`].filter(Boolean).join(' ')
}
const r = spawnSync('npx', args, { stdio: 'inherit', env, shell: process.platform === 'win32' })
process.exit(r.status ?? 1)
