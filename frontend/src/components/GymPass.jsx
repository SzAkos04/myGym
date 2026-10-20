// Gym pass (myGym): the Settings page, the form that adds, edits and renews a pass, and the three
// places Home speaks up (lib/gym-pass.js decides when):
//   - PassCard   the card above today's workout when the pass is due or has run out, with
//                "Bought it" (the form, filled in from the last pass) and "Later";
//   - PassLine   the quiet line under today's workout once the card was put off;
//   - the week strip's ring on the last day (Home.jsx, passStatus().end).
// The finish summary shows a visit pass's count (PassVisits).
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { t, dateLocale } from '../lib/i18n.js'
import { DAYN, fmtDate, todayISO, uid } from '../lib/format.js'
import { cleanPass, daysBetween, passEnd, passHistory, passStatus, renewalDraft, visitsUsed, REMIND_DAYS } from '../lib/gym-pass.js'
import { Button, NumberField, Row, Section, Segmented, Stepper } from './ui.jsx'
import Icon from './Icon.jsx'

const update = (fn, push) => useStore.getState().update(fn, push)
const toast = m => useUI.getState().toast(m)

export const passName = p => (p.kind === 'visits'
  ? t('{0}-visit pass', Number(p.visits) || 10)
  : Number(p.days) === 30 || Number(p.days) === 31 ? t('Monthly pass') : t('{0}-day pass', Number(p.days) || 30))

export const fmtPrice = (price, cur) => Number(price) > 0
  ? Number(price).toLocaleString(dateLocale(), { maximumFractionDigits: 2 }) + (cur ? ' ' + cur : '')
  : null

/** "Ends Thursday" / "Ends 14 Nov" / "2 visits left" — the short state line Home and the page share. */
export function passLine(st, today = todayISO()) {
  if (st.state === 'expired') {
    if (st.visitsLeft === 0 && !(st.end && today > st.end)) return t('All visits used')
    const ago = daysBetween(st.end, today)
    return ago <= 1 ? t('Pass expired yesterday') : t('Pass expired {0}', fmtDate(st.end))
  }
  if (st.visitsLeft != null && (st.daysLeft == null || st.visitsLeft <= 2)) return t('Visits left: {0}', st.visitsLeft)
  if (st.daysLeft === 0) return t('Pass ends today')
  if (st.daysLeft === 1) return t('Pass ends tomorrow')
  if (st.daysLeft != null && st.daysLeft < 7) return t('Pass ends {0}', t(DAYN[new Date(st.end + 'T12:00:00').getDay()]))
  return st.end ? t('Until {0}', fmtDate(st.end)) : ''
}

// "Later": this state of this pass is noted, so the card gives way to the quiet line; a pass that
// runs out after being put off as due brings the card back once.
const putOff = id => update(s => {
  const p = (s.gymPasses || []).find(x => x?.id === id)
  if (p) p.later = passStatus(s, todayISO()).state === 'expired' ? 'expired' : 'due'
})

/* ---------------- the form ---------------- */

function PassForm({ close, pass, draft, title, sub }) {
  const today = todayISO()
  const [p, setP] = useState(() => ({ remind: REMIND_DAYS, ...(pass || draft) }))
  const set = patch => setP(x => ({ ...x, ...patch }))
  const end = p.kind === 'visits' ? (p.until || null) : passEnd({ ...p, days: p.days || 30 })
  const save = () => {
    if (!p.start) { toast(t('Pick a start date')); return }
    const clean = cleanPass({ ...p, id: pass?.id || uid() })
    update(s => {
      s.gymPasses = Array.isArray(s.gymPasses) ? s.gymPasses : []
      const i = s.gymPasses.findIndex(x => x?.id === clean.id)
      if (i >= 0) s.gymPasses[i] = { ...clean, ...(s.gymPasses[i].later && pass ? { later: s.gymPasses[i].later } : {}) }
      else s.gymPasses.push(clean)
    })
    close()
    toast(pass ? t('Pass saved') : t('Pass added'))
  }
  const remove = () => {
    update(s => { s.gymPasses = (s.gymPasses || []).filter(x => x?.id !== pass.id) })
    close(); toast(t('Pass removed'))
  }
  return <>
    <h3 style={{ marginBottom: sub ? 2 : 14 }}>{title}</h3>
    {sub && <div className="muted small" style={{ marginBottom: 14 }}>{sub}</div>}
    <Segmented options={[{ value: 'time', label: t('By time') }, { value: 'visits', label: t('By visits') }]}
      value={p.kind === 'visits' ? 'visits' : 'time'} onChange={k => set({ kind: k, ...(k === 'visits' ? { visits: p.visits || 10 } : { days: p.days || 30 }) })} />
    <div style={{ height: 12 }} />
    <Section>
      {p.kind === 'visits'
        ? <Row title={t('Visits')}><Stepper value={p.visits || 10} min={1} max={500} decimal={false} onChange={v => set({ visits: v })} ariaLabel={t('Visits')} /></Row>
        : <Row title={t('Length')}><Stepper value={p.days || 30} min={1} max={730} decimal={false} unit={t('days')} onChange={v => set({ days: v })} ariaLabel={t('Length')} /></Row>}
      <Row title={t('Starts')}><input type="date" className="timef" value={p.start || ''} onChange={e => set({ start: e.target.value })} /></Row>
      {p.kind === 'visits'
        ? <Row title={t('Valid until')} subtitle={p.until ? null : t('Optional')}>
            <input type="date" className="timef" value={p.until || ''} min={p.start} onChange={e => set({ until: e.target.value || undefined })} />
          </Row>
        : <Row title={t('Ends')} value={end ? fmtDate(end, true) : '–'} />}
      <Row title={t('Remind me')}><Stepper value={p.remind ?? REMIND_DAYS} min={0} max={30} decimal={false} unit={t('days')} onChange={v => set({ remind: v })} ariaLabel={t('Remind me')} /></Row>
    </Section>
    <p className="sect-f" style={{ marginTop: -14, marginBottom: 16 }}>{p.kind === 'visits'
      ? t('Home tells you when 2 visits are left, or this many days before it expires.')
      : t('Home tells you this many days before it ends.')}</p>
    <Section title={t('Price')} footer={t('Optional. Kept with your earlier passes, so you can see what the gym costs you.')}>
      <Row title={t('Paid')}>
        <span className="row" style={{ gap: 6 }}>
          <NumberField className="timef" value={p.price ?? null} nullable onChange={v => set({ price: v })} style={{ width: 100, textAlign: 'end' }} placeholder="0" aria-label={t('Paid')} />
          <input className="timef" value={p.cur || ''} onChange={e => set({ cur: e.target.value })} placeholder="Ft" style={{ width: 58 }} aria-label={t('Currency')} maxLength={6} />
        </span>
      </Row>
    </Section>
    <Button variant="primary" onClick={save}>{t('Save pass')}</Button>
    {pass && <><div style={{ height: 8 }} /><Button variant="danger" onClick={remove}>{t('Remove pass')}</Button></>}
    {!pass && p.start < today && p.kind === 'time' && end < today && <div className="muted small" style={{ marginTop: 10 }}>{t('This pass has already ended. It goes to your earlier passes.')}</div>}
  </>
}

const openForm = props => useUI.getState().openSheet(close => <PassForm close={close} {...props} />)

/** A new pass from scratch, or the next one filled in from the latest. */
export function addPassSheet() {
  const S = useStore.getState().S
  const last = passHistory(S)[0] || null
  const draft = renewalDraft(last, todayISO())
  openForm(last
    ? { draft, title: t('New pass'), sub: t("Same as last time. Change anything that's different.") }
    : { draft, title: t('Add a pass') })
}
export const editPassSheet = pass => openForm({ pass, title: passName(pass) })

/* ---------------- the Settings page ---------------- */

export function GymPassPage() {
  const S = useStore(s => s.S)
  const today = todayISO()
  const st = passStatus(S, today)
  const list = passHistory(S)
  const cur = st.pass && st.state !== 'none' ? st.pass : null
  const earlier = list.filter(p => p !== cur && p !== st.next)
  const year = today.slice(0, 4)
  const thisYear = list.filter(p => p.start.slice(0, 4) === year && Number(p.price) > 0)
  const curOf = thisYear.find(p => p.cur)?.cur || ''
  const spent = thisYear.reduce((n, p) => n + Number(p.price), 0)
  const logVisit = () => update(s => {
    const p = (s.gymPasses || []).find(x => x?.id === cur.id)
    if (!p) return
    const has = new Set([...(p.extra || []), ...(s.workouts || []).filter(w => w?.d === today).map(w => w.d)])
    if (has.has(today)) { toast(t('Today already counts')); return }
    p.extra = [...(p.extra || []), today].sort()
  })
  const undoVisit = () => update(s => {
    const p = (s.gymPasses || []).find(x => x?.id === cur.id)
    if (p?.extra?.length) p.extra = p.extra.slice(0, -1)
  })
  const tone = st.state === 'expired' ? 'bad' : st.state === 'due' ? 'warn' : ''
  return <>
    {cur ? <Section title={t('Current pass')} footer={cur.kind === 'time' ? t('With reminders on, a notification comes the evening before it ends.') : null}>
      <div className={'pass-now ' + tone}>
        <Row icon="ticket" iconTint={tone === 'bad' ? 'var(--red)' : tone === 'warn' ? 'var(--orange)' : 'var(--indigo)'}
          title={passName(cur)} subtitle={[fmtDate(cur.start) + (st.end ? ' – ' + fmtDate(st.end) : ''), passLine(st, today)].filter(Boolean).join(' · ')}
          accessory="chevron" onClick={() => editPassSheet(cur)} />
        {cur.kind === 'visits'
          ? <div className="pass-dots" aria-label={t('{0} of {1} visits used', st.used, cur.visits)}>
              {Array.from({ length: Math.min(60, Number(cur.visits) || 0) }, (_, i) => <i key={i} className={i < st.used ? 'u' : ''} />)}
            </div>
          : st.end && <div className="pass-bar"><span style={{ width: Math.min(100, Math.max(2, 100 * (daysBetween(cur.start, today) + 1) / (daysBetween(cur.start, st.end) + 1))) + '%' }} /></div>}
      </div>
      {cur.kind === 'visits' && <div className="pass-acts">
        <Button size="sm" onClick={logVisit}>{t('Log a visit')}</Button>
        {cur.extra?.length > 0 && <Button size="sm" variant="ghost" onClick={undoVisit}>{t('Undo last')}</Button>}
      </div>}
    </Section> : <Section footer={t('Add the pass you bought. Home stays quiet while it is good and tells you when the next one is due.')}>
      <Row icon="ticket" iconTint="var(--indigo)" title={t('No pass yet')} />
    </Section>}
    {st.next && <Section title={t('Next pass')}>
      <Row icon="ticket" iconTint="var(--green)" title={passName(st.next)} subtitle={t('Starts {0}', fmtDate(st.next.start, true))} accessory="chevron" onClick={() => editPassSheet(st.next)} />
    </Section>}
    <Button variant={cur && st.state === 'ok' ? 'plain' : 'primary'} icon="plus" onClick={addPassSheet}>{cur ? t('Add the next pass') : t('Add a pass')}</Button>
    {cur?.kind === 'visits' && <p className="sect-f" style={{ marginTop: 8 }}>{t('Visits are counted from your workouts. Log one here for a day you went without one.')}</p>}
    {earlier.length > 0 && <Section title={t('Earlier passes')} footer={spent > 0 ? t('{0} on passes in {1}', fmtPrice(spent, curOf), year) : null}>
      {earlier.map(p => <Row key={p.id} title={passName(p)}
        subtitle={fmtDate(p.start) + (passEnd(p) ? ' – ' + fmtDate(passEnd(p)) : '') + (p.kind === 'visits' ? ' · ' + t('{0} of {1} used', visitsUsed(p, S.workouts, today), p.visits) : '')}
        value={fmtPrice(p.price, p.cur)} accessory="chevron" onClick={() => editPassSheet(p)} />)}
    </Section>}
  </>
}

/** The Settings root row's preview. */
export function passPreview(S) {
  const st = passStatus(S, todayISO())
  if (st.state === 'none') return t('None')
  if (st.state === 'ok' && st.next && (!st.pass || st.pass === st.next)) return t('Starts {0}', fmtDate(st.next.start))
  return passLine(st)
}

/* ---------------- Home ---------------- */

/** The card above today's workout: shown when the pass is due or has run out, until put off. */
export function PassCard() {
  const S = useStore(s => s.S)
  const st = passStatus(S, todayISO())
  if ((st.state !== 'due' && st.state !== 'expired') || st.later) return null
  const bad = st.state === 'expired'
  return <div className={'card pass-card ' + (bad ? 'bad' : 'warn')}>
    <div className="row" style={{ gap: 10 }}>
      <span className="lrow-i" style={{ '--tint': bad ? 'var(--red)' : 'var(--orange)' }}><Icon name="ticket" /></span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="lbl2">{t('Gym pass')}</div>
        <div className="ttl">{passLine(st)}</div>
        <div className="ss">{passName(st.pass)}{st.end && st.state === 'due' ? ' · ' + fmtDate(st.end) : ''}</div>
      </div>
    </div>
    <div className="pass-acts">
      <Button size="sm" variant="primary" onClick={addPassSheet}>{t('Bought it')}</Button>
      <Button size="sm" onClick={() => putOff(st.pass.id)}>{t('Later')}</Button>
    </div>
  </div>
}

/** The quiet line under today's workout, once the card was put off. */
export function PassLine() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const st = passStatus(S, todayISO())
  if ((st.state !== 'due' && st.state !== 'expired') || !st.later) return null
  return <button className={'pass-line ' + (st.state === 'expired' ? 'bad' : 'warn')}
    onClick={e => { e.stopPropagation(); nav('/settings/pass') }}>
    <Icon name="ticket" /><span>{passLine(st)}</span><Icon name="chevronRight" className="chev" />
  </button>
}

/** A visit pass's count on the finish summary: which visit this was, orange when few are left. */
export function PassVisits() {
  const S = useStore(s => s.S)
  const st = passStatus(S, todayISO())
  if (!st.pass || st.pass.kind !== 'visits' || st.state === 'none' || st.next) return null
  const low = st.state !== 'ok'
  return <div className={'pass-visits ' + (low ? 'warn' : '')}>
    <Icon name="ticket" />
    <span>{low ? t('Visits left: {0}', st.visitsLeft) : t('Visit {0} of {1}', st.used, st.pass.visits)}</span>
  </div>
}
