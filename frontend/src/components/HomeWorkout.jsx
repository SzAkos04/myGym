// myGym fork: Home's workout preview and Last workout card (views/Home.jsx calls both).
//   workoutPreviewSheet  a tap on Today shows what the session holds, Strong-style, before it starts:
//                        every exercise with the sets and weights the plan has for today and what
//                        you did last time. Start is one more tap, from the sheet.
//   LastWorkoutCard      the last session's numbers and its exercises, each with its best set,
//                        instead of a name and a date.
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { EXIDX } from '../lib/exercises.js'
import { exerciseNameFor, exerciseNameClass, t, tn } from '../lib/i18n.js'
import { buildCombinedEntries, deriveSessionName } from '../lib/session-merge.js'
import { lastEntryFor, setLabel } from '../lib/history.js'
import { isWarmupRow } from '../lib/workout-model.js'
import { todaySummary, lastWorkoutSummary } from '../lib/home-stats.js'
import { fmtDate, fmtNum, todayISO } from '../lib/format.js'
import { speedUnitOf } from '../lib/speed.js'
import { closeThenNav } from '../lib/nav.js'
import { tappable } from '../lib/use-sheet-keyboard.js'
import { bestSet, setsLine } from '../lib/home-workout.js'
import { startFlow, workoutDetailSheet } from '../sheets.jsx'
import { Thumb } from './Media.jsx'
import { Button } from './ui.jsx'
import Icon from './Icon.jsx'

const nameOf = id => (EXIDX[id] ? exerciseNameFor(EXIDX[id]) : id)
const setsWord = n => tn('{0} set', '{0} sets', n)
// A set with no weight on it yet (a new routine, a bodyweight move) reads "8 reps", not "0×8".
const label = (id, s, cfg, speed) => (s.r > 0 && !(s.w > 0) && !(s.sec > 0) && !(s.min > 0) ? tn('{0} rep', '{0} reps', s.r) : setLabel(id, s, cfg, speed))

export const workoutPreviewSheet = ids => useUI.getState().openSheet(close => <WorkoutPreview ids={ids} close={close} />)

function WorkoutPreview({ ids, close }) {
  const st = useStore(s => s.S)
  const { entries, routines } = buildCombinedEntries(st, ids)
  const sum = todaySummary(st.workouts, routines, todayISO())
  const speed = speedUnitOf(st)
  const work = e => (e.sets || []).filter(s => !isWarmupRow(s))
  const total = entries.reduce((n, e) => n + work(e).length, 0)
  return <>
    <h3>{deriveSessionName(routines.map(r => r.name)) || t('Workout')}</h3>
    <div className="muted small" style={{ marginBottom: 12 }}>
      {[tn('{0} exercise', '{0} exercises', entries.length), setsWord(total), sum.estMin ? t('about {0} min', sum.estMin) : null].filter(Boolean).join(' · ')}
    </div>
    {entries.map((e, i) => {
      const ex = EXIDX[e.id]
      const warm = (e.sets || []).length - work(e).length
      const last = lastEntryFor(st, e.id, e.rid)
      return <div key={i} className="row wd-ex" style={{ alignItems: 'flex-start' }}>
        {ex && <Thumb ex={ex} />}
        <div className="grow" style={{ minWidth: 0 }}>
          <div className={`tt ${exerciseNameClass(ex)}`} style={{ fontWeight: 600 }}>{nameOf(e.id)}</div>
          <div className="ss">{setsLine(work(e).map(s => label(e.id, s, e.target, speed)), setsWord)}{warm > 0 && <span className="dim">{' · ' + tn('{0} warm-up', '{0} warm-ups', warm)}</span>}</div>
          {last && <div className="small dim" style={{ marginTop: 2 }}>{t('Last time')}: {setsLine(last.sets.map(s => label(e.id, s, last.target, speed)), setsWord)}</div>}
        </div>
      </div>
    })}
    <div style={{ height: 14 }} />
    <Button variant="primary" icon="play" onClick={() => { close(); startFlow(ids) }}>{t('Start workout')}</Button>
    {routines.length === 1 && <>
      <div style={{ height: 8 }} />
      <Button icon="pencil" onClick={() => closeThenNav(close, '/plan/r/' + routines[0].id)}>{t('Edit routine')}</Button>
    </>}
  </>
}

export function LastWorkoutCard() {
  const S = useStore(s => s.S)
  const sum = lastWorkoutSummary(S.workouts)
  if (!sum) return null
  const w = S.workouts.filter(x => x.d === sum.d).at(-1)
  const done = (w?.entries || []).map(e => ({ e, best: bestSet(e.sets) })).filter(x => x.best)
  const speed = speedUnitOf(S)
  return <div className="card tappable last-workout" style={{ cursor: 'pointer' }} {...tappable(() => { if (w) workoutDetailSheet(w) })}>
    <div className="row between">
      <div className="row" style={{ gap: 11, minWidth: 0 }}>
        <span className="lrow-i" style={{ background: 'var(--surface-3)', color: 'var(--label-2)' }}><Icon name="history" /></span>
        <div style={{ minWidth: 0 }}>
          <div className="lbl2">{t('Last workout')} · {fmtDate(sum.d, true)}</div>
          <div className="ttl">{sum.name || t('Workout')}</div>
        </div>
      </div>
      <Icon name="chevronRight" className="chev" />
    </div>
    <div className="hero-stats">
      {sum.mins > 0 && <div><b>{t('{0} min', sum.mins)}</b><span>{t('Duration')}</span></div>}
      <div><b>{fmtNum(sum.volume)}</b><span>{S.unit} · {t('Volume')}</span></div>
      <div><b>{sum.sets}</b><span>{t('Sets')}</span></div>
      <div><b className={sum.prs ? 'pr-num' : ''}>{sum.prs}</b><span>{t('Records')}</span></div>
    </div>
    {done.length > 0 && <div className="lw-list">
      {done.slice(0, 5).map(({ e, best }, i) => <div key={i} className="row between">
        <span className={exerciseNameClass(EXIDX[e.id])}>{nameOf(e.id)}</span>
        <b>{label(e.id, best, e.target, speed)}</b>
      </div>)}
      {done.length > 5 && <div className="dim">{t('+{0} more', done.length - 5)}</div>}
    </div>}
  </div>
}
