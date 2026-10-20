import type { CalendarEvent, GridBlock, Palette, TodoItem } from '@kkumikkumi/schema'
import { useState } from 'react'
import chevronLeftUrl from '../icons/chevron-left.svg'
import chevronRightUrl from '../icons/chevron-right.svg'
import { useBoard, type BoardActions } from '../BoardContext'
import { useDayData } from '../calendarData'
import {
  addDays,
  localDate,
  monthDay,
  monthGrid,
  parseDate,
  shiftMonth,
  timeLabel,
  weekdayLabels,
  weekOf,
  type DayCell,
} from '../calendar'
import { blockPalette, maskCss } from '../style'

type CalendarBlockT = Extract<GridBlock, { type: 'calendar' }>

/**
 * 월 캘린더. L은 Figma 6:2597(월: 요일 + 칸에 일정 칩, 주: 7열 목록), M은 Figma 3:2013(미니: 숫자 + 일정 있는 날 점).
 * 날짜를 누르면 일정 추가, 일정을 누르면 고치기(사용 모드). 마감일 있는 투두는 읽기 전용으로 함께 보인다.
 * 달 이동은 보기 상태라 편집 모드에서도 허용.
 */
export function CalendarBlock({ block }: { block: CalendarBlockT }) {
  const { theme, now, actions, mode, data } = useBoard()
  const p = blockPalette(theme, block)
  const { weekStartsOn } = block.props
  const mini = block.size === 'M'
  const week = !mini && block.props.view === 'week'
  const today = localDate(now.getTime())
  const [view, setView] = useState({ year: now.getFullYear(), month0: now.getMonth() })
  const [weekAnchor, setWeekAnchor] = useState(today)

  const anchor = parseDate(weekAnchor)
  const rows: DayCell[][] = week
    ? [weekOf(anchor.y, anchor.m0, anchor.d, weekStartsOn)]
    : monthGrid(view.year, view.month0, weekStartsOn)
  const days = rows.flat().map((c) => c.date)
  const dd = useDayData(days, actions, data.version ?? 0)
  const open = mode === 'use' ? actions?.calendar.openEditor : undefined

  const nav = (dir: -1 | 1) =>
    week
      ? setWeekAnchor((d) => addDays(d, dir * 7))
      : setView((v) => shiftMonth(v.year, v.month0, dir))
  const title = week ? weekTitle(days) : `${view.year}년 ${view.month0 + 1}월`
  // 칸 높이에 들어가는 칩 수(월: 6주면 1개, 그 외 2개). 넘친 수는 날짜 옆 +N
  const maxItems = week ? 12 : rows.length >= 6 ? 1 : 2
  const gridRows = { gridTemplateRows: `repeat(${rows.length}, minmax(0, 1fr))` }

  return (
    <div className={`kc ${mini ? 'kc--mini' : ''} ${week ? 'kc--week' : ''}`}>
      <header className="kc-head">
        <h2 className="kc-title" style={{ color: p.text }}>
          {title}
        </h2>
        <div className="kc-navs">
          <NavButton dir={-1} label={week ? '이전 주' : '이전 달'} palette={p} onClick={nav} />
          <NavButton dir={1} label={week ? '다음 주' : '다음 달'} palette={p} onClick={nav} />
        </div>
      </header>
      {mini ? (
        <div className="kc-mini-grid" style={{ ...gridRows, color: p.subText }}>
          {rows.flat().map((c) => {
            const ev = dd.events.get(c.date) ?? []
            const has = ev.length > 0 || (dd.todos.get(c.date)?.length ?? 0) > 0
            return (
              <DayButton
                key={c.date}
                className={`kc-mini-day ${c.inMonth ? '' : 'is-outside'} ${c.date === today ? 'is-today' : ''}`}
                date={c.date}
                count={ev.length}
                onOpen={open}
              >
                <span style={c.date === today ? { color: p.text } : undefined}>{c.day}</span>
                <i
                  className={`kc-dot ${has ? 'is-on' : ''}`}
                  style={{ background: ev[0]?.color ?? p.subText }}
                />
              </DayButton>
            )
          })}
        </div>
      ) : (
        <>
          <div className="kc-weekdays" style={{ color: p.subText }}>
            {weekdayLabels(weekStartsOn).map((l) => (
              <span key={l}>{l}</span>
            ))}
          </div>
          <div className="kc-grid" style={gridRows}>
            {rows.flat().map((c) => (
              <DayButton
                key={c.date}
                className={`kc-cell ${c.inMonth || week ? '' : 'is-outside'} ${c.date === today ? 'is-today' : ''}`}
                style={{ background: p.surface, color: p.subText }}
                date={c.date}
                count={dd.events.get(c.date)?.length ?? 0}
                onOpen={open}
              >
                <span className="kc-cell-head">
                  <span
                    className="kc-date"
                    style={c.date === today ? { color: p.text } : undefined}
                  >
                    {c.day}
                  </span>
                  <MoreCount
                    total={
                      (dd.events.get(c.date)?.length ?? 0) + (dd.todos.get(c.date)?.length ?? 0)
                    }
                    max={maxItems}
                  />
                </span>
                <DayItems
                  date={c.date}
                  events={dd.events.get(c.date) ?? []}
                  todos={dd.todos.get(c.date) ?? []}
                  max={maxItems}
                  withTime={week}
                  palette={p}
                  onOpen={open}
                />
              </DayButton>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

const weekTitle = (days: readonly string[]) => {
  const a = monthDay(days[0]!)
  const b = monthDay(days[days.length - 1]!)
  return a.m === b.m ? `${a.m}월 ${a.d}–${b.d}일` : `${a.m}월 ${a.d}일 – ${b.m}월 ${b.d}일`
}

/** 날짜 칸: 사용 모드면 눌러서 일정 추가(키보드 Enter/Space 포함) */
function DayButton({
  className,
  style,
  date,
  count,
  onOpen,
  children,
}: {
  className: string
  style?: React.CSSProperties
  date: string
  count: number
  onOpen: BoardActions['calendar']['openEditor'] | undefined
  children: React.ReactNode
}) {
  const { m, d } = monthDay(date)
  const label = `${m}월 ${d}일${count ? `, 일정 ${count}개` : ''}`
  if (!onOpen)
    return (
      <div className={className} style={style}>
        {children}
      </div>
    )
  return (
    <div
      className={`${className} is-clickable`}
      style={style}
      role="button"
      tabIndex={0}
      aria-label={`${label}, 일정 추가`}
      onClick={(e) => {
        if (e.target === e.currentTarget || !(e.target as HTMLElement).closest('.kc-chip'))
          onOpen({ date })
      }}
      onKeyDown={(e) => {
        if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault()
          onOpen({ date })
        }
      }}
    >
      {children}
    </div>
  )
}

function DayItems({
  date,
  events,
  todos,
  max,
  withTime,
  palette: p,
  onOpen,
}: {
  date: string
  events: CalendarEvent[]
  todos: TodoItem[]
  max: number
  withTime: boolean
  palette: Palette
  onOpen: BoardActions['calendar']['openEditor'] | undefined
}) {
  const total = events.length + todos.length
  if (total === 0) return null
  const shownEvents = events.slice(0, max)
  const shownTodos = todos.slice(0, Math.max(0, max - shownEvents.length))
  return (
    <div className="kc-items">
      {shownEvents.map((e) => {
        // 여러 날 걸친 시각 일정은 시작한 날에만 시각을 보인다
        const time =
          withTime && !e.allDay && localDate(e.startUtc) === date ? `${timeLabel(e.startUtc)} ` : ''
        return onOpen ? (
          <button
            key={e.id}
            type="button"
            className="kc-chip"
            style={{ borderColor: e.color, color: p.text }}
            onClick={() => onOpen({ event: e })}
          >
            {time}
            {e.title}
          </button>
        ) : (
          <span key={e.id} className="kc-chip" style={{ borderColor: e.color, color: p.text }}>
            {time}
            {e.title}
          </span>
        )
      })}
      {shownTodos.map((t) => (
        <span key={t.id} className={`kc-chip kc-chip--todo ${t.done ? 'is-done' : ''}`}>
          {t.done ? '☑' : '☐'} {t.title}
        </span>
      ))}
    </div>
  )
}

function MoreCount({ total, max }: { total: number; max: number }) {
  return total > max ? <span className="kc-more">+{total - max}</span> : null
}

function NavButton({
  dir,
  label,
  palette,
  onClick,
}: {
  dir: -1 | 1
  label: string
  palette: Palette
  onClick(dir: -1 | 1): void
}) {
  return (
    <button
      type="button"
      className="kc-nav"
      aria-label={label}
      style={{ background: palette.control }}
      onClick={() => onClick(dir)}
    >
      <span
        className="kc-chevron"
        style={maskCss(dir < 0 ? chevronLeftUrl : chevronRightUrl, palette.text)}
      />
    </button>
  )
}
