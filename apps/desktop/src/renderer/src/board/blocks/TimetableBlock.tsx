import type { GridBlock } from '@kkumikkumi/schema'
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import type { TimetableData } from '../../../../shared/api'
import { useBoard } from '../BoardContext'
import {
  autoColors,
  cellEntry,
  currentPeriod,
  DAY_LABEL,
  dayItems,
  entryColor,
  isNow,
  minuteOfDay,
  pickTimetable,
  themeTones,
  toMin,
  visibleDays,
  weekdayOf,
  type TimetableView,
} from '../timetable'

type TimetableBlockT = Extract<GridBlock, { type: 'timetable' }>

/**
 * 시간표 블록. S·M은 오늘 수업 목록(지금 수업 강조, 끝난 수업은 흐리게), L은 한 주.
 * 편집은 시간표 페이지에서만 한다. props.timetableId가 null(또는 지워진 시간표)이면 고른 시간표를 따라가고,
 * 그때는 블록 머리의 이름을 눌러 고른 시간표를 바꿀 수 있다(전역 설정이 바뀌고 테마는 그대로).
 */
export function TimetableBlock({ block }: { block: TimetableBlockT }) {
  const { theme, data, now } = useBoard()
  const p = theme.defaults.palette
  const vars = { '--ktt-accent': p.accent, '--ktt-sub': p.subText } as CSSProperties
  const all = data.timetable
  const tt = all && pickTimetable(all, block.props.timetableId)
  if (!all || !tt)
    return (
      <div className={`ktt ktt--${block.size}`} style={vars}>
        {all && <p className="ktt-empty">시간표가 없어요</p>}
      </div>
    )
  const tones = themeTones(p)
  const follows = !all.timetables.some((t) => t.id === block.props.timetableId)
  // 시간표가 하나뿐이면 이름은 보여 주지 않는다
  const name = all.timetables.length > 1 && <Switcher all={all} tt={tt} follows={follows} />
  return (
    <div className={`ktt ktt--${block.size}`} style={vars}>
      {block.size === 'L' ? (
        <>
          {name && <div className="ktt-head">{name}</div>}
          <Week tt={tt} now={now} tones={tones} />
        </>
      ) : (
        <Today tt={tt} now={now} sub={p.subText} tones={tones} name={name} />
      )}
    </div>
  )
}

/** 블록 머리의 시간표 이름. 따라가는 블록이면(사용 모드) 눌러서 고른 시간표를 바꾼다. */
function Switcher({
  all,
  tt,
  follows,
}: {
  all: TimetableData
  tt: TimetableView
  follows: boolean
}) {
  const { mode, actions } = useBoard()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('pointerdown', onDown)
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [open])

  const select = mode === 'use' && follows ? actions?.timetable?.select : undefined
  if (!select)
    return (
      <span
        className="ktt-name"
        title={follows ? undefined : '이 블록은 이 시간표로 고정돼 있어요'}
      >
        {tt.timetable.name}
      </span>
    )
  return (
    <div className="ktt-switch" ref={ref}>
      <button
        type="button"
        className="ktt-name is-button"
        aria-haspopup="menu"
        aria-expanded={open}
        title="시간표 바꾸기"
        onClick={() => setOpen(!open)}
      >
        <span className="ktt-name-text">{tt.timetable.name}</span>
        <span className="ktt-caret" aria-hidden />
      </button>
      {open && (
        <div className="ktt-menu" role="menu" aria-label="시간표 고르기">
          {all.timetables.map((t) => (
            <button
              key={t.id}
              type="button"
              role="menuitemradio"
              aria-checked={t.id === tt.timetable.id}
              onClick={() => {
                setOpen(false)
                if (t.id !== tt.timetable.id) select(t.id)
              }}
            >
              {t.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function Today({
  tt,
  now,
  sub,
  tones,
  name,
}: {
  tt: TimetableView
  now: Date
  sub: string
  tones: readonly string[]
  name: ReactNode
}) {
  const s = tt.settings
  const day = weekdayOf(now)
  const minute = minuteOfDay(now)
  const auto = autoColors(tt.entries.filter((e) => e.slot.kind === s.mode))
  const items = visibleDays(s).includes(day) ? dayItems(tt.entries, s, day) : []
  // 지금 수업(없으면 다음 수업)이 보이도록 목록을 내린다. 다 끝났으면 마지막 수업.
  const upcoming = items.findIndex((i) => toMin(i.end) > minute)
  const focusIndex = upcoming === -1 ? items.length - 1 : upcoming
  const list = useRef<HTMLUListElement>(null)
  useEffect(() => {
    const el = list.current
    const row = el?.children[focusIndex] as HTMLElement | undefined
    if (el && row) el.scrollTop = Math.max(0, row.offsetTop - el.offsetTop - 4)
  }, [focusIndex, items.length])
  return (
    <>
      <div className="ktt-head">
        <div className="kt-chip">
          <span style={{ color: sub }}>오늘 · {DAY_LABEL[day]}요일</span>
        </div>
        {name}
      </div>
      {items.length === 0 ? (
        <p className="ktt-empty">오늘은 수업이 없어요</p>
      ) : (
        <ul className="ktt-list" ref={list}>
          {items.map((i) => {
            const state = isNow(i, minute) ? 'is-now' : toMin(i.end) <= minute ? 'is-past' : ''
            return (
              <li key={i.entry.id} className={`ktt-row ${state}`}>
                <span className="ktt-when">{i.period !== null ? `${i.period}교시` : i.start}</span>
                <span
                  className="ktt-bar"
                  style={{ background: entryColor(i.entry, auto, tones) }}
                />
                <span className="ktt-what">
                  <span className="ktt-subject">{i.entry.subject}</span>
                  {i.entry.room && <span className="ktt-room">{i.entry.room}</span>}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}

function Week({ tt, now, tones }: { tt: TimetableView; now: Date; tones: readonly string[] }) {
  const s = tt.settings
  const days = visibleDays(s)
  const today = weekdayOf(now)
  const minute = minuteOfDay(now)
  const auto = autoColors(tt.entries.filter((e) => e.slot.kind === s.mode))
  const cols = `${s.mode === 'period' ? '44px ' : ''}repeat(${days.length}, minmax(0, 1fr))`

  const head = days.map((d) => (
    <div key={d} className={`ktt-dayhead ${d === today ? 'is-today' : ''}`}>
      {DAY_LABEL[d]}
    </div>
  ))

  if (s.mode === 'period') {
    const nowPeriod = currentPeriod(s.periods, minute)
    return (
      <div
        className="ktt-week"
        style={{
          gridTemplateColumns: cols,
          gridTemplateRows: `auto repeat(${s.periods.length}, minmax(0, 1fr))`,
        }}
      >
        <div />
        {head}
        {s.periods.map((_, pi) => (
          <Row key={pi}>
            <div className="ktt-period">{pi + 1}</div>
            {days.map((d) => {
              const e = cellEntry(tt.entries, d, pi + 1)
              const isNowCell = d === today && nowPeriod === pi
              return (
                <div
                  key={d}
                  className={`ktt-cell ${e ? 'is-filled' : ''} ${isNowCell ? 'is-now' : ''}`}
                  style={e ? { background: entryColor(e, auto, tones) } : undefined}
                >
                  {e?.subject}
                </div>
              )
            })}
          </Row>
        ))}
      </div>
    )
  }

  // 시간 방식: 요일마다 수업을 시작 순으로 쌓는다
  return (
    <div
      className="ktt-week"
      style={{ gridTemplateColumns: cols, gridTemplateRows: 'auto minmax(0, 1fr)' }}
    >
      {head}
      {days.map((d) => (
        <ul key={d} className={`ktt-daylist ${d === today ? 'is-today' : ''}`}>
          {dayItems(tt.entries, s, d).map((i) => (
            <li
              key={i.entry.id}
              className={`ktt-chipitem ${d === today && isNow(i, minute) ? 'is-now' : ''}`}
              style={{ background: entryColor(i.entry, auto, tones) }}
            >
              <span className="ktt-time">{i.start}</span>
              <span className="ktt-subject">{i.entry.subject}</span>
            </li>
          ))}
        </ul>
      ))}
    </div>
  )
}

/** 그리드 행을 묶는 투명 래퍼(display: contents) */
function Row({ children }: { children: ReactNode }) {
  return <div className="ktt-rowgroup">{children}</div>
}
