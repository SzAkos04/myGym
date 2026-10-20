import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { t, tn } from '../lib/i18n.js'
import { WorkoutRow, DayNoteRow, workoutDetailSheet, logPastWorkoutSheet } from '../sheets.jsx'
import { Button } from '../components/ui.jsx'
import Icon from '../components/Icon.jsx'
import { dayNoteOf } from '../lib/day-notes.js'
import { monthTotals } from '../lib/home-stats.js'
import { fmtDur } from '../lib/format.js'
import { dateLocale } from '../lib/i18n.js'

// Newest first: every workout, and in between them the days off you left a note on (#261). A
// note on a day that has a workout too stays in the day sheet; the workout speaks for that day.
export function historyRows(S) {
  const trained = new Set((S.workouts || []).map(w => w?.d))
  const notes = Object.keys(S.dayNotes || {}).filter(d => !trained.has(d)).map(d => ({ d, note: dayNoteOf(S, d) })).filter(x => x.note)
  const rows = [...(S.workouts || []).map(w => ({ d: w.d, w })), ...notes]
  // Stable, so workouts keep the order they are stored in (by day, then start) within a day.
  return rows.map((r, i) => [r, i]).sort((a, b) => (a[0].d < b[0].d ? 1 : a[0].d > b[0].d ? -1 : b[1] - a[1])).map(([r]) => r)
}

const PAGE = 40

export default function History() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const rows = historyRows(S)
  const totals = monthTotals(S.workouts)
  // A year of training is a couple of hundred rows, and drawing them all made opening History take
  // twice as long as any other screen on an iPhone 11. The first PAGE rows come at once, the next
  // ones as you scroll near the end. Where nothing can watch the scrolling, all of them at once.
  const [shown, setShown] = useState(PAGE)
  const end = useRef(null)
  const more = shown < rows.length
  useEffect(() => {
    if (!more) return
    if (typeof IntersectionObserver === 'undefined') { setShown(Infinity); return }
    const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) setShown(n => n + PAGE) }, { rootMargin: '800px 0px' })
    io.observe(end.current)
    return () => io.disconnect()
  }, [more, shown])
  return <>
    <div className="hdr"><button className="iconbtn" onClick={() => nav('/stats')} aria-label={t('Stats')}><Icon name="chevronLeft" /></button>
      <div style={{ flex: 1, marginInlineStart: 12 }}><h1>{t('History')}</h1><div className="sub">{tn('{0} workout', '{0} workouts', S.workouts.length)}</div></div></div>
    <Button icon="plus" onClick={logPastWorkoutSheet} style={{ marginBottom: 12 }}>{t('Log a past workout')}</Button>
    {rows.length ? <><div className="list">{rows.slice(0, shown).map((r, i) => {
      const month = r.d.slice(0, 7)
      // A heading when the month changes, wearing what that month added up to.
      const head = (i === 0 || rows[i - 1].d.slice(0, 7) !== month) && <h4 key={'m-' + month} className="sec month-head">
        {new Date(month + '-15T12:00:00').toLocaleDateString(dateLocale(), { month: 'long', year: 'numeric' })}
        <span>{tn('{0} workout', '{0} workouts', totals[month]?.workouts || 0)}{totals[month]?.mins ? ' · ' + fmtDur(totals[month].mins * 60000) : ''}</span>
      </h4>
      return [head, r.w
        ? <WorkoutRow key={r.w.id} w={r.w} onClick={() => workoutDetailSheet(r.w)} />
        : <DayNoteRow key={'note-' + r.d} iso={r.d} note={r.note} />]
    })}</div>{more && <div ref={end} style={{ height: 1 }} />}</>
      : <div className="empty"><div className="ico"><Icon name="history" /></div>{t('No workouts yet. Your first one will land here.')}</div>}
  </>
}
