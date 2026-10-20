import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { lazyAssets, stampSw } from './scripts/sw-stamp.mjs'

const backend = process.env.API_TARGET || 'http://127.0.0.1:3000'
// The API refuses a state-changing request that a browser sent from anywhere other than its own
// ORIGIN (the CSRF guard in api/server.js). The dev server is on a different port, so the page's
// real Origin is not ORIGIN — modern browsers get through on Sec-Fetch-Site: same-origin, and
// presenting the expected Origin here covers the ones that don't send it. Match your .env if you
// changed ORIGIN: API_ORIGIN=https://gym.example.com npm run dev
const apiOrigin = process.env.API_ORIGIN || 'http://localhost:8080'
// Exercise media: served straight from catalogue/media in dev (see catalogueMedia below), or
// proxied to a server of your choice with MEDIA_TARGET.
const media = process.env.MEDIA_TARGET
const catalogueMedia = {
  name: 'opengym-catalogue-media',
  configureServer(server) {
    if (media) return
    const dirs = { '/exercise-media/still/': ['still', '.webp'], '/exercise-media/clip/': ['clip', '.mp4'] }
    const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '../catalogue/media')
    server.middlewares.use((req, res, next) => {
      const prefix = Object.keys(dirs).find(p => req.url.startsWith(p))
      if (!prefix) return next()
      const [dir, ext] = dirs[prefix]
      const name = decodeURIComponent(req.url.slice(prefix.length).split('?')[0])
      const file = join(root, dir, name)
      if (!/^\d{4,5}\.(webp|mp4)$/.test(name) || !name.endsWith(ext) || !existsSync(file)) { res.statusCode = 404; return res.end() }
      res.setHeader('Content-Type', ext === '.mp4' ? 'video/mp4' : 'image/webp')
      res.end(readFileSync(file))
    })
  }
}

// Optional web analytics (Umami). Injected only when BOTH vars are set at build time,
// so a plain `npm run build` — and every self-hosted install — stays telemetry-free.
// Set for the public instance: VITE_UMAMI_SRC=https://stats.example/script.js VITE_UMAMI_ID=<uuid>
const umamiSrc = process.env.VITE_UMAMI_SRC
const umamiId = process.env.VITE_UMAMI_ID

const umami = {
  name: 'opengym-umami',
  transformIndexHtml() {
    if (!umamiSrc || !umamiId) return
    return [{
      tag: 'script',
      attrs: { defer: true, src: umamiSrc, 'data-website-id': umamiId },
      injectTo: 'head'
    }]
  }
}

// The service worker's cache is named after the build (public/sw.js carries a `__BUILD__`
// placeholder): a deploy is then a new worker with its own cache, and the previous build's
// shell and chunks are dropped on activate instead of piling up under one fixed name. The
// stamp is a hash of the built index.html — it changes exactly when the bundle does.
// The directory is the one this build wrote to (`--outDir` included), not a fixed ./dist/: a
// build into a private outDir left `__BUILD__` unstamped in its sw.js.
// The worker also gets the build's code that loads on demand (`__LAZY__`, scripts/sw-stamp.mjs),
// so it is there offline before the page has ever needed it.
let outDir = fileURLToPath(new URL('./dist/', import.meta.url))
let lazy = []
const swStamp = {
  name: 'opengym-sw-stamp',
  apply: 'build',
  configResolved(config) { outDir = resolve(config.root, config.build.outDir) },
  generateBundle(_, bundle) { lazy = lazyAssets(bundle) },
  closeBundle() {
    const html = join(outDir, 'index.html'), sw = join(outDir, 'sw.js')
    if (!existsSync(html) || !existsSync(sw)) return
    const stamp = createHash('sha256').update(readFileSync(html)).digest('hex').slice(0, 10)
    writeFileSync(sw, stampSw(readFileSync(sw, 'utf8'), { stamp, lazy }))
  }
}

// The phone flavour says so in its index.html. A web build that ran into the same dist/ between
// the mobile build and `cap sync` (two builds in one worktree) shipped the web shell inside an
// APK: no Android-only settings, a service worker, the passkey login. scripts/check-mobile-bundle.mjs
// reads this tag in the synced copy after `cap sync` and fails the build without it.
const flavor = {
  name: 'opengym-flavor',
  transformIndexHtml() {
    if (process.env.VITE_MOBILE !== '1') return
    return [{ tag: 'meta', attrs: { name: 'opengym-flavor', content: 'mobile' }, injectTo: 'head' }]
  }
}

// The version people are asked for in #install-help and on every bug report. Read from
// package.json so it cannot drift from the release it was built in, and inlined at build
// time so no runtime fetch is involved.
//
// APP_BUILD, when the build sets it, is appended as "1.3.8+<build>". A packaged build carries a
// version its package.json cannot know — every image built between two releases reports the same
// number, so the one question a bug report turns on, "which build were you running?", had no
// answer from inside the app. Unset (the ordinary case, and every upstream build) it changes
// nothing: the string is exactly package.json's version.
const pkgVersion = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version
const appVersion = process.env.APP_BUILD ? `${pkgVersion}+${process.env.APP_BUILD}` : pkgVersion

// Which languages a build ships. Each other language's packs (UI text, exercise names, exercise
// instructions) are built as empty modules: the files stay in the repo, so pulling upstream never
// conflicts over them, but they add nothing to the bundle or to what the service worker downloads
// on every install and update. `APP_LANGS=all` ships every language; a list ("en,de,hu") picks.
const langsEnv = (process.env.APP_LANGS || 'en').trim()
const appLangs = langsEnv === 'all' ? null : langsEnv.split(',').map(l => l.trim().split('-')[0]).filter(Boolean)
const packLangs = {
  name: 'opengym-langs',
  apply: 'build',
  enforce: 'pre',
  load(id) {
    if (!appLangs) return null
    const m = id.split('?')[0].replace(/\\/g, '/').match(/\/src\/(?:locales|exercise-names|instr)\/([A-Za-z-]+)\.js$/)
    if (!m || m[1] === 'en' || appLangs.includes(m[1].split('-')[0])) return null
    return 'export default {}'
  }
}

// What myGym leaves out of openGym (src/lib/fork-profile.js). The code stays, so pulling upstream does not
// conflict over it; the switches below take it off the screen, and Rollup drops what nothing reaches any
// more. Tests keep everything on, so the upstream suites still cover the parts that are switched off here.
const FORK_OFF = ['coach', 'checkin', 'android', 'guest']
const FORK_HIDDEN_CATEGORIES = ['mobility', 'stretching', 'yoga', 'pilates', 'combat', 'rehab']
const forkDefines = mode => {
  const fork = mode !== 'test'
  const on = f => String(!(fork && FORK_OFF.includes(f)))
  return {
    __MYGYM_COACH__: on('coach'), __MYGYM_CHECKIN__: on('checkin'), __MYGYM_ANDROID__: on('android'), __MYGYM_GUEST__: on('guest'),
    __MYGYM_HIDDEN_CATEGORIES__: JSON.stringify(fork ? FORK_HIDDEN_CATEGORIES : []),
  }
}

// The parts the switches above turn off that would still ship as chunks of their own, because something
// can reach them with import(): the coach's on-phone engine and its canned demo (the coach screens are
// gone), and the QR reader only the gym check-in used. In a myGym build they are empty modules, the way
// packLangs empties the languages: nothing to download, nothing for the service worker to cache.
const FORK_STUBS = [
  // The coach's screens and their stylesheet: their routes are switched off, but App.jsx and Admin.jsx
  // import them, and a stylesheet import is never dropped. coach.css shipped to every page, where its
  // .typing rule once turned the whole page into a flex box (lib/viewport-guard.js).
  [/\/src\/views\/(CoachChat|CoachIntake|CoachSetup|AdminCoach)\.jsx$/, 'export default function Off() { return null }'],
  [/\/src\/coach\.css$/, ''],
  // myGym Lite: one way to change screens. The new screen's own CSS slide (index.css, #app.vfade) is all
  // that moves; nothing copies the old screen (ScreenGhost), keeps pictures of left screens
  // (screen-snapshots) or runs a scripted slide and the swipe back from the edge (EdgeSwipeBack). On an
  // iPhone 11 each copy took as long to lay out as the slide it was for.
  [/\/src\/components\/EdgeSwipeBack\.jsx$/, 'export default function EdgeSwipeBack() { return null }'],
  [/\/src\/components\/ScreenGhost\.jsx$/, 'export default function ScreenGhost() { return null }'],
  [/\/src\/lib\/screen-snapshots\.js$/, 'export const saveSnapshot = () => {}; export const getSnapshot = () => null; export const saveTabBar = () => {}; export const getTabBar = () => null; export const resetSnapshots = () => {}'],
  [/\/src\/lib\/coach-local\.js$/, 'export {}'],
  [/\/src\/lib\/coach-demo\.js$/, 'export {}'],
  [/\/node_modules\/jsqr\//, 'export default function jsQR() { return null }'],
]
const forkStubs = {
  name: 'mygym-fork-stubs',
  // The dev server too, so what runs on localhost is what ships; the tests keep the upstream code.
  apply: (config, { mode }) => mode !== 'test',
  enforce: 'pre',
  load(id) {
    const path = id.split('?')[0].replace(/\\/g, '/')
    const hit = FORK_STUBS.find(([re]) => re.test(path))
    return hit ? hit[1] : null
  }
}

// Dev only (the dev and preview servers, never a build): sign a browser in that has no console to set the
// session cookie on, such as Safari in the iOS Simulator. Open /__dev-session?c=<value>, the value from
// api/scripts/dev-session.mjs; the cookie is set for this localhost origin and the app opens. Anyone able
// to reach a dev server on localhost could set a cookie there anyway.
const devSession = {
  name: 'mygym-dev-session',
  configureServer(server) { server.middlewares.use(devSessionRoute) },
  configurePreviewServer(server) { server.middlewares.use(devSessionRoute) },
}
function devSessionRoute(req, res, next) {
  const host = String(req.headers.host || '').split(':')[0]
  // DEV_SESSION=<value> on the server: every request without a session gets it, so a home-screen web app
  // (its own cookies, no address bar to open the route below in) is signed in from its next load.
  const auto = process.env.DEV_SESSION
  if (auto && ['localhost', '127.0.0.1', '[::1]'].includes(host) && !/(?:^|;\s*)gymsid=/.test(req.headers.cookie || '')) {
    res.setHeader('Set-Cookie', `gymsid=${auto}; Path=/; SameSite=Lax; Max-Age=7776000`)
    // …and this request carries it already, so the API it is proxied to answers signed in.
    req.headers.cookie = (req.headers.cookie ? req.headers.cookie + '; ' : '') + `gymsid=${auto}`
  }
  if (!req.url?.startsWith('/__dev-session')) return next()
  if (!['localhost', '127.0.0.1', '[::1]'].includes(host)) { res.statusCode = 403; return res.end('localhost only') }
  const c = new URL(req.url, 'http://x').searchParams.get('c') || ''
  if (!/^[A-Za-z0-9_-]+:\d+:\d+\.[A-Za-z0-9_-]+$/.test(c)) { res.statusCode = 400; return res.end('expected the value dev-session.mjs prints after gymsid=') }
  res.statusCode = 302
  res.setHeader('Set-Cookie', `gymsid=${c}; Path=/; SameSite=Lax; Max-Age=7776000`)
  res.setHeader('Location', '/#/home')
  res.end()
}

export default defineConfig(({ command, mode }) => ({
  // __APP_LANGS__ narrows the language picker (lib/i18n-core.js); in dev and tests it is null: everything.
  define: { __APP_VERSION__: JSON.stringify(appVersion), __APP_LANGS__: command === 'build' && appLangs ? JSON.stringify(appLangs) : 'null', ...forkDefines(mode) },
  plugins: [react(), umami, flavor, swStamp, catalogueMedia, packLangs, forkStubs, devSession],
  base: './',
  server: {
    // The Coach's core (payload, validator, prompts, HTTP adapters) lives in ../api/coach/core
    // and is imported by the phone build. vite build and vitest already reach it; the dev
    // server needs to be told the workspace is wider than frontend/.
    fs: { allow: ['..'] },
    proxy: {
      '/api': { target: backend, changeOrigin: true, headers: { Origin: apiOrigin } },
      ...(media ? {
        '/exercise-media': { target: media, changeOrigin: true }
      } : {})
    }
  },
  build: { chunkSizeWarningLimit: 1500 }
}))
