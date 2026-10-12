import type { CalendarEvent, TodoItem } from '@kkumikkumi/schema'
import {
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import type { BoardActions } from '../board/BoardContext'
import {
  localDate,
  monthGrid,
  timeLabel,
  weekdayLabels,
  weekOf,
  type EventInput,
} from '../board/calendar'
import { useDayData } from '../board/calendarData'
import checkUrl from '../board/icons/check.svg'
import {
  dayDiff,
  layoutDay,
  MINUTES_PER_DAY,
  minuteOfDay,
  minutesToTime,
  moveTimedEvent,
  shiftAnchor,
  shiftEventDays,
  SNAP_MIN,
  snapMinutes,
  type CalView,
} from './calendarView'
import './pages.css'

interface Props {
  actions: BoardActions
  /** 사용자 데이터가 바뀔 때마다 증가(다시 조회) */
  version: number
  now: Date
  weekStartsOn: 0 | 1
  updateEvent(id: string, e: EventInput): Promise<boolean>
}

const VIEWS: { id: CalView; label: string }[] = [
  { id: 'month', label: '월' },
  { id: 'week', label: '주' },
  { id: 'day', label: '일' },
]
const HOUR_PX = 48
const MONTH_CHIPS = 3
const DOW = ['일', '월', '화', '수', '목', '금', '토']

const parts = (d: string) => d.split('-').map(Number) as [number, number, number]
const dow = (d: string) => {
  const [y, m, day] = parts(d)
  return DOW[new Date(Date.UTC(y, m - 1, day)).getUTCDay()]!
}
const md = (d: string) => `${parts(d)[1]}월 ${parts(d)[2]}일`

function titleFor(view: CalView, anchor: string, days: readonly string[]): string {
  const [y, m] = parts(anchor)
  if (view === 'month') return `${y}년 ${m}월`
  if (view === 'day') return `${md(anchor)} (${dow(anchor)})`
  const first = days[0]!
  const last = days[days.length - 1]!
  return parts(first)[1] === parts(last)[1]
    ? `${md(first)} – ${parts(last)[2]}일`
    : `${md(first)} – ${md(last)}`
}

function visibleDays(view: CalView, anchor: string, weekStartsOn: 0 | 1): string[] {
  const [y, m, d] = parts(anchor)
  if (view === 'day') return [anchor]
  if (view === 'week') return weekOf(y, m - 1, d, weekStartsOn).map((c) => c.date)
  return monthGrid(y, m - 1, weekStartsOn)
    .flat()
    .map((c) => c.date)
}

/* ───────── 끌어서 옮기기 ───────── */

type DropTarget = { kind: 'day'; date: string } | { kind: 'time'; date: string; minute: number }
interface Drag {
  event: CalendarEvent
  /** 끌기 시작한 칸의 날짜(여러 날 일정은 잡은 칸 기준으로 옮긴다) */
  originDate: string
  /** 시간 칸에서 잡은 위치와 일정 시작 사이의 분 */
  grabMin: number
  startX: number
  startY: number
  moved: boolean
  target: DropTarget | null
}

/** 화면 좌표 아래의 놓을 자리(data-drop 칸) */
function dropTargetAt(x: number, y: number, grabMin: number): DropTarget | null {
  const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-drop]')
  const date = el?.dataset['date']
  if (!el || !date) return null
  if (el.dataset['drop'] === 'day') return { kind: 'day', date }
  const r = el.getBoundingClientRect()
  const minute = snapMinutes(((y - r.top) / r.height) * MINUTES_PER_DAY - grabMin)
  return {
    kind: 'time',
    date,
    minute: Math.max(0, Math.min(MINUTES_PER_DAY - SNAP_MIN, minute)),
  }
}

/** 놓은 자리에 맞춘 새 일정. 바뀌지 않으면 null. */
function dropResult(d: Drag): EventInput | null {
  const t = d.target
  if (!t) return null
  if (t.kind === 'day') {
    const n = dayDiff(d.originDate, t.date)
    return n === 0 ? null : shiftEventDays(d.event, n)
  }
  if (d.event.allDay) return null // 종일 일정은 시간 칸에 놓지 않는다
  const next = moveTimedEvent(d.event, t.date, t.minute)
  return !next.allDay && next.startUtc === d.event.startUtc ? null : next
}

function useEventDrag(actions: BoardActions, update: Props['updateEvent']) {
  const [drag, setDrag] = useState<Drag | null>(null)
  const ref = useRef<Drag | null>(null)
  const set = (d: Drag | null) => {
    ref.current = d
    setDrag(d)
  }

  /** 일정 요소에 붙이는 포인터 핸들러. 움직이지 않고 떼면 고치기 창을 연다. */
  const bind = (event: CalendarEvent, originDate: string, grabMin = 0) => ({
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
      if (e.button !== 0) return
      e.stopPropagation()
      // 칸 밖으로 끌어도 이 요소가 이벤트를 받게 한다(이미 끝난 포인터면 무시)
      try {
        e.currentTarget.setPointerCapture(e.pointerId)
      } catch {
        /* 무시 */
      }
      set({
        event,
        originDate,
        grabMin,
        startX: e.clientX,
        startY: e.clientY,
        moved: false,
        target: null,
      })
    },
    onPointerMove: (e: ReactPointerEvent<HTMLElement>) => {
      const d = ref.current
      if (!d || d.event.id !== event.id) return
      const moved = d.moved || Math.hypot(e.clientX - d.startX, e.clientY - d.startY) > 4
      if (!moved) return
      set({ ...d, moved, target: dropTargetAt(e.clientX, e.clientY, d.grabMin) })
    },
    onPointerUp: () => {
      const d = ref.current
      set(null)
      if (!d || d.event.id !== event.id) return
      if (!d.moved) return actions.calendar.openEditor({ event })
      const next = dropResult(d)
      if (next) void update(event.id, next)
    },
    onPointerCancel: () => set(null),
    onDoubleClick: (e: ReactMouseEvent) => e.stopPropagation(),
    onKeyDown: (e: ReactKeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        actions.calendar.openEditor({ event })
      }
    },
  })

  return { drag: drag?.moved ? drag : null, bind }
}

/* ───────── 페이지 ───────── */

/** 캘린더 세부 페이지: 월/주/일 보기 + 고른 날의 목록. 일정은 끌어서 옮긴다. */
export function CalendarPage({ actions, version, now, weekStartsOn, updateEvent }: Props) {
  const today = localDate(now.getTime())
  const [view, setView] = useState<CalView>('month')
  const [anchor, setAnchor] = useState(today)
  const days = visibleDays(view, anchor, weekStartsOn)
  const data = useDayData(days, actions, version)
  const { drag, bind } = useEventDrag(actions, updateEvent)

  return (
    <div className="pg pg-cal">
      <section className="pg-card pg-cal-main" aria-label="캘린더">
        <header className="pg-head">
          <h1 className="pg-title">{titleFor(view, anchor, days)}</h1>
          <div className="pg-tabs">
            <button
              type="button"
              className="pg-pill pg-round"
              aria-label="이전"
              onClick={() => setAnchor(shiftAnchor(anchor, view, -1))}
            >
              ‹
            </button>
            <button type="button" className="pg-pill is-filled" onClick={() => setAnchor(today)}>
              오늘
            </button>
            <button
              type="button"
              className="pg-pill pg-round"
              aria-label="다음"
              onClick={() => setAnchor(shiftAnchor(anchor, view, 1))}
            >
              ›
            </button>
          </div>
          <div className="pg-tabs" role="tablist" aria-label="보기">
            {VIEWS.map((v) => (
              <button
                key={v.id}
                type="button"
                role="tab"
                aria-selected={view === v.id}
                className="pg-pill"
                onClick={() => setView(v.id)}
              >
                {v.label}
              </button>
            ))}
          </div>
        </header>

        {view === 'month' ? (
          <MonthView
            anchor={anchor}
            today={today}
            weekStartsOn={weekStartsOn}
            events={data.events}
            todos={data.todos}
            drag={drag}
            bind={bind}
            onSelect={setAnchor}
            onAdd={(date) => actions.calendar.openEditor({ date })}
          />
        ) : (
          <TimeView
            days={days}
            today={today}
            now={now}
            selected={anchor}
            events={data.events}
            todos={data.todos}
            drag={drag}
            bind={bind}
            onSelect={setAnchor}
            onAdd={(date, time) => actions.calendar.openEditor({ date, time })}
          />
        )}
      </section>

      <Agenda
        date={anchor}
        events={data.events.get(anchor) ?? []}
        todos={data.todos.get(anchor) ?? []}
        actions={actions}
      />
    </div>
  )
}

type Bind = ReturnType<typeof useEventDrag>['bind']

function EventChip({
  e,
  date,
  bind,
  dragging,
}: {
  e: CalendarEvent
  date: string
  bind: Bind
  dragging: boolean
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      className={`cp-chip ${dragging ? 'is-dragging' : ''}`}
      style={{ borderLeftColor: e.color }}
      title={e.title}
      {...bind(e, date)}
    >
      {!e.allDay && <span className="cp-chip-time">{timeLabel(e.startUtc)}</span>}
      {e.title}
    </div>
  )
}

function TodoChip({ t }: { t: TodoItem }) {
  return (
    <div className={`cp-chip cp-chip--todo ${t.done ? 'is-done' : ''}`} title={t.title}>
      {t.title}
    </div>
  )
}

function MonthView({
  anchor,
  today,
  weekStartsOn,
  events,
  todos,
  drag,
  bind,
  onSelect,
  onAdd,
}: {
  anchor: string
  today: string
  weekStartsOn: 0 | 1
  events: Map<string, CalendarEvent[]>
  todos: Map<string, TodoItem[]>
  drag: Drag | null
  bind: Bind
  onSelect(date: string): void
  onAdd(date: string): void
}) {
  const [y, m] = parts(anchor)
  const weeks = monthGrid(y, m - 1, weekStartsOn)
  return (
    <div className="cp-month" style={{ gridTemplateRows: `auto repeat(${weeks.length}, 1fr)` }}>
      {weekdayLabels(weekStartsOn).map((l) => (
        <div key={l} className="cp-dow">
          {l}
        </div>
      ))}
      {weeks.flat().map((c) => {
        const evs = events.get(c.date) ?? []
        const tds = todos.get(c.date) ?? []
        const shownEvs = evs.slice(0, MONTH_CHIPS)
        const shownTds = tds.slice(0, Math.max(0, MONTH_CHIPS - shownEvs.length))
        const more = evs.length + tds.length - shownEvs.length - shownTds.length
        const isTarget = drag?.target?.kind === 'day' && drag.target.date === c.date
        return (
          <div
            key={c.date}
            className={[
              'cp-cell',
              c.inMonth ? '' : 'is-out',
              c.date === anchor ? 'is-selected' : '',
              isTarget ? 'is-drop-target' : '',
            ].join(' ')}
            data-drop="day"
            data-date={c.date}
            onClick={() => onSelect(c.date)}
            onDoubleClick={() => onAdd(c.date)}
          >
            <div className="cp-cell-head">
              <span className={`cp-daynum ${c.date === today ? 'is-today' : ''}`}>{c.day}</span>
              {more > 0 && <span className="cp-more">+{more}</span>}
            </div>
            {shownEvs.map((e) => (
              <EventChip
                key={e.id}
                e={e}
                date={c.date}
                bind={bind}
                dragging={drag?.event.id === e.id}
              />
            ))}
            {shownTds.map((t) => (
              <TodoChip key={t.id} t={t} />
            ))}
          </div>
        )
      })}
    </div>
  )
}

function TimeView({
  days,
  today,
  now,
  selected,
  events,
  todos,
  drag,
  bind,
  onSelect,
  onAdd,
}: {
  days: readonly string[]
  today: string
  now: Date
  selected: string
  events: Map<string, CalendarEvent[]>
  todos: Map<string, TodoItem[]>
  drag: Drag | null
  bind: Bind
  onSelect(date: string): void
  onAdd(date: string, time: string): void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  // 처음 열 때 아침 8시 근처부터 보여 준다
  useLayoutEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 8 * HOUR_PX - 8
  }, [])
  const cols = { gridTemplateColumns: `56px repeat(${days.length}, minmax(0, 1fr))` }
  const nowMin = minuteOfDay(now.getTime())

  return (
    <div className="cp-time">
      <div className="cp-time-head" style={cols}>
        <span />
        {days.map((d) => (
          <button
            key={d}
            type="button"
            className={`cp-colhead ${d === selected ? 'is-selected' : ''}`}
            onClick={() => onSelect(d)}
          >
            <span>{dow(d)}</span>
            <span className={`cp-daynum ${d === today ? 'is-today' : ''}`}>{parts(d)[2]}</span>
          </button>
        ))}
      </div>
      <div className="cp-allday" style={cols}>
        <span className="cp-gutter-label">종일</span>
        {days.map((d) => {
          const isTarget = drag?.target?.kind === 'day' && drag.target.date === d
          return (
            <div
              key={d}
              className={`cp-allday-cell ${isTarget ? 'is-drop-target' : ''}`}
              data-drop="day"
              data-date={d}
            >
              {(events.get(d) ?? [])
                .filter((e) => e.allDay)
                .map((e) => (
                  <EventChip
                    key={e.id}
                    e={e}
                    date={d}
                    bind={bind}
                    dragging={drag?.event.id === e.id}
                  />
                ))}
              {(todos.get(d) ?? []).map((t) => (
                <TodoChip key={t.id} t={t} />
              ))}
            </div>
          )
        })}
      </div>
      <div className="cp-scroll" ref={scrollRef}>
        <div className="cp-grid" style={{ ...cols, height: 24 * HOUR_PX }}>
          <div className="cp-hours">
            {Array.from({ length: 23 }, (_, i) => (
              <span key={i} style={{ top: (i + 1) * HOUR_PX }}>
                {String(i + 1).padStart(2, '0')}:00
              </span>
            ))}
          </div>
          {days.map((d) => (
            <DayColumn
              key={d}
              date={d}
              events={(events.get(d) ?? []).filter(
                (e): e is Extract<CalendarEvent, { allDay: false }> => !e.allDay,
              )}
              drag={drag}
              bind={bind}
              nowMin={d === today ? nowMin : null}
              onAdd={onAdd}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function DayColumn({
  date,
  events,
  drag,
  bind,
  nowMin,
  onAdd,
}: {
  date: string
  events: Extract<CalendarEvent, { allDay: false }>[]
  drag: Drag | null
  bind: Bind
  nowMin: number | null
  onAdd(date: string, time: string): void
}) {
  const px = (min: number) => (min / 60) * HOUR_PX
  const ghost =
    drag && !drag.event.allDay && drag.target?.kind === 'time' && drag.target.date === date
      ? drag.target.minute
      : null
  let ghostNode: ReactNode = null
  if (ghost !== null && drag && !drag.event.allDay) {
    const len = Math.max(SNAP_MIN, (drag.event.endUtc - drag.event.startUtc) / 60_000)
    ghostNode = (
      <div
        className="cp-slot cp-ghost"
        style={{
          top: px(ghost),
          height: px(Math.min(len, MINUTES_PER_DAY - ghost)),
          borderLeftColor: drag.event.color,
        }}
      >
        <span className="cp-chip-time">{minutesToTime(ghost)}</span>
        {drag.event.title}
      </div>
    )
  }

  return (
    <div
      className="cp-col"
      data-drop="time"
      data-date={date}
      onDoubleClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect()
        const min = Math.floor((((e.clientY - r.top) / r.height) * MINUTES_PER_DAY) / 30) * 30
        onAdd(date, minutesToTime(min))
      }}
    >
      {layoutDay(events, date).map((s) => {
        const grabFrom = (clientY: number, el: HTMLElement) => {
          const col = el.closest<HTMLElement>('.cp-col')!.getBoundingClientRect()
          return ((clientY - col.top) / col.height) * MINUTES_PER_DAY - s.startMin
        }
        const b = bind(s.event, date)
        return (
          <div
            key={s.event.id}
            role="button"
            tabIndex={0}
            className={`cp-slot ${drag?.event.id === s.event.id ? 'is-dragging' : ''}`}
            style={{
              top: px(s.startMin),
              height: px(s.endMin - s.startMin),
              left: `calc(${(s.col / s.cols) * 100}% + 2px)`,
              width: `calc(${100 / s.cols}% - 4px)`,
              borderLeftColor: s.event.color,
            }}
            title={s.event.title}
            {...b}
            onPointerDown={(e) => {
              // 잡은 위치를 기억해 놓을 때 일정 시작이 그만큼 위로 오게 한다
              const grab = grabFrom(e.clientY, e.currentTarget)
              bind(s.event, date, grab).onPointerDown(e)
            }}
          >
            <span className="cp-chip-time">
              {timeLabel(s.event.startUtc)}–{timeLabel(s.event.endUtc)}
            </span>
            <span className="cp-slot-title">{s.event.title}</span>
          </div>
        )
      })}
      {ghostNode}
      {nowMin !== null && <div className="cp-now" style={{ top: px(nowMin) }} />}
    </div>
  )
}

function Agenda({
  date,
  events,
  todos,
  actions,
}: {
  date: string
  events: CalendarEvent[]
  todos: TodoItem[]
  actions: BoardActions
}) {
  const allDay = events.filter((e) => e.allDay)
  const timed = events.filter((e) => !e.allDay)
  const row = (e: CalendarEvent) => (
    <li key={e.id}>
      <button
        type="button"
        className="cp-agenda-item"
        style={{ borderLeftColor: e.color }}
        onClick={() => actions.calendar.openEditor({ event: e })}
      >
        <span className="cp-agenda-time">
          {e.allDay ? '종일' : `${timeLabel(e.startUtc)} – ${timeLabel(e.endUtc)}`}
        </span>
        <span className="cp-agenda-title">{e.title}</span>
        {e.note && <span className="cp-agenda-note">{e.note}</span>}
      </button>
    </li>
  )
  return (
    <aside className="pg-card pg-cal-side" aria-label="고른 날">
      <div className="pg-head">
        <h2 className="pg-chip">
          {md(date)} ({dow(date)})
        </h2>
        <span className="pg-spacer" />
        <button
          type="button"
          className="pg-pill is-filled"
          onClick={() => actions.calendar.openEditor({ date })}
        >
          + 일정
        </button>
      </div>
      {events.length === 0 && todos.length === 0 ? (
        <p className="pg-empty">일정이 없어요</p>
      ) : (
        <>
          {events.length > 0 && (
            <ul className="cp-agenda">
              {allDay.map(row)}
              {timed.map(row)}
            </ul>
          )}
          {todos.length > 0 && (
            <section className="cp-agenda-todos">
              <h3 className="pg-field-label">마감 할 일</h3>
              <ul className="cp-agenda">
                {todos.map((t) => (
                  <li key={t.id} className="cp-agenda-todo">
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={t.done}
                      aria-label={t.done ? '완료 취소' : '완료'}
                      className={`pg-check ${t.done ? 'is-done' : ''}`}
                      onClick={() => void actions.todo.update(t.id, { done: !t.done })}
                    >
                      {t.done && <img src={checkUrl} alt="" draggable={false} />}
                    </button>
                    <span className={t.done ? 'is-done' : ''}>{t.title}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </aside>
  )
}
