import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { DEMO } from '../lib/demo.js'
import { t } from '../lib/i18n.js'
import { api } from '../lib/api.js'
import { fmtAgo } from '../lib/format.js'
import { cloudState, fmtPing } from '../lib/sync-cloud.js'
import { actionLabel, syncNowWithToast, hostOf } from './ServerSync.jsx'
import { useConnection, showsConnection, connectionAction } from './SyncBanner.jsx'
import Icon from './Icon.jsx'

// How long a sync has to be out before the arrows turn: a push after an edit lands well within
// this, and a cloud that flickered at every tap would only be noise.
const BUSY_AFTER_MS = 300

// The tiny glyph on the cloud's corner: a tick when synced, dots while waiting, ! when it is not.
const BADGE = {
  ok: <path d="M3.4 6.3 5.2 8.1 8.7 4.3" />,
  wait: <path d="M3.4 6h.01M6 6h.01M8.6 6h.01" />,
  off: <path d="M6 3.4v3.2M6 8.6h.01" />,
  bad: <path d="M6 3.4v3.2M6 8.6h.01" />,
}

/* The connection, always in view on Home: a cloud beside the Settings gear. Quiet while
   everything is synced, turning while a sync is out, crossed out when the server cannot be
   reached or says no. A tap opens a small panel: which server, when it last synced, what is still
   waiting, how fast it answers (asked once, as the panel opens: nothing polls for it), and the one
   thing to do about it. The bar at the top still says it when something is wrong; this is its
   quiet companion. "Show connection status" off hides it too (the dot on the gear stays). Never
   on a device without a server, nor in the demo. */
export default function SyncCloud() {
  const on = useStore(s => showsConnection(s.S))
  const busy = useStore(s => !!s.sync?.busy)
  const { view, user, status, waited } = useConnection()
  const [slow, setSlow] = useState(false)
  const [open, setOpen] = useState(false)
  const btn = useRef(null)
  useEffect(() => {
    if (!busy) { setSlow(false); return }
    const tm = setTimeout(() => setSlow(true), BUSY_AFTER_MS)
    return () => clearTimeout(tm)
  }, [busy])

  const st = DEMO || !user || !on ? null : cloudState({ tone: view?.tone, status, busy: slow, pendingWaited: waited })
  if (!st) return null
  const line = st === 'sync' ? t('Syncing…') : st === 'ok' ? t('All synced') : view.line
  return <>
    <button ref={btn} className={'iconbtn sync-cloud ' + st} onClick={() => setOpen(o => !o)}
      aria-label={t('Server connection') + ', ' + line} aria-expanded={open} aria-haspopup="dialog">
      <Icon name={st === 'sync' ? 'reset' : st === 'off' || st === 'bad' ? 'cloudSlash' : 'cloud'} />
      {BADGE[st] && <svg className="sync-cloud-b" viewBox="0 0 12 12" aria-hidden="true">{BADGE[st]}</svg>}
    </button>
    {open && createPortal(<CloudPanel anchor={btn} st={st} line={line} view={view} user={user} status={status} close={() => setOpen(false)} />, document.body)}
  </>
}

function CloudPanel({ anchor, st, line, view, user, status, close }) {
  const nav = useNavigate()
  const sync = useStore(s => s.sync)
  useStore(s => s.S)   // the count of waiting changes follows every edit
  const unsynced = useStore(s => s.unsyncedChanges)
  const [pos, setPos] = useState(null)
  const [ping, setPing] = useState(null)   // null asking, a number, or 'none'
  const [working, setWorking] = useState(false)

  // Under the cloud, its right edge on the cloud's, and kept there: the bar at the top slides in or out
  // when the connection changes and pushes the page (and the cloud) down or up while the panel is open.
  // The cloud is looked at once a frame, only while the panel is open, and the panel moves when it did.
  useLayoutEffect(() => {
    let raf = 0, last = ''
    const track = () => {
      const r = anchor.current?.getBoundingClientRect()
      if (r) {
        const top = Math.round(r.bottom + 10), right = Math.max(12, Math.round(window.innerWidth - r.right))
        if (top + ',' + right !== last) { last = top + ',' + right; setPos({ top, right }) }
      }
      raf = window.requestAnimationFrame(track)
    }
    track()
    window.addEventListener('scroll', close, { passive: true })
    const esc = e => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', esc)
    return () => { window.cancelAnimationFrame(raf); window.removeEventListener('scroll', close); window.removeEventListener('keydown', esc) }
  }, [])
  // How fast the server answers right now: one request, as the panel opens.
  useEffect(() => {
    let live = true
    const t0 = performance.now()
    api('/api/health', { timeout: 5000 })
      .then(() => { if (live) setPing(performance.now() - t0) })
      .catch(() => { if (live) setPing('none') })
    return () => { live = false }
  }, [])

  const owed = typeof unsynced === 'function' ? unsynced() : { owed: false, count: 0 }
  const waiting = !owed.owed ? '0' : owed.count != null ? String(owed.count) : '–'
  const doIt = async fn => {
    if (working) return
    setWorking(true)
    try { await fn() } finally { setWorking(false) }
  }
  const ok = st === 'ok' || st === 'sync' || st === 'wait'
  const act = ok ? () => syncNowWithToast() : connectionAction(view.action, { user, status, nav })
  const label = ok ? t('Sync now') : actionLabel(view)
  return <>
    <div className="sync-pop-bg" onClick={close} />
    <div className={'sync-pop ' + st} role="dialog" aria-label={t('Server connection')} style={pos ? { top: pos.top, right: pos.right } : { visibility: 'hidden' }}>
      <div className="sync-pop-h">{line}</div>
      {sync?.server && <div className="sync-pop-host">{hostOf(sync.server)}</div>}
      <dl>
        <dt>{t('Last synced')}</dt><dd>{sync?.lastSynced ? fmtAgo(sync.lastSynced) : '–'}</dd>
        <dt>{t('Waiting changes')}</dt><dd>{waiting}</dd>
        <dt>{t('Response time')}</dt><dd>{ping == null ? '…' : ping === 'none' ? t('No answer') : fmtPing(ping)}</dd>
      </dl>
      {!ok && view.banner && <p className="sync-pop-note">{view.banner}</p>}
      <div className="sync-pop-b">
        {act && label && <button className="btn primary" disabled={working} onClick={() => doIt(act)}>{working && (ok || view.action === 'retry') ? t('Syncing…') : label}</button>}
        <button className="btn" onClick={() => { close(); nav('/settings/account') }}>{t('Settings')}</button>
      </div>
    </div>
  </>
}
