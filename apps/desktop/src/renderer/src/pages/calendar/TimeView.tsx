import type { CalendarEvent, TodoItem } from '@kkumikkumi/schema'
import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { localDayStart, timeLabel } from '../../board/calendar'
import { layoutDay, MINUTES_PER_DAY, minuteOfDay, minutesToTime, SNAP_MIN } from '../calendarView'
import { dateParts, weekdayLabel } from '../dateText'
import { EventChip, TodoChip } from './chips'
import type { Bind, Drag } from './useEventDrag'

const HOUR_PX = 48

/** 주/일 보기: 날짜 머리, 종일 줄, 시간 칸(15분 단위로 끌어 옮기기) */
export function TimeView({
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
            <span>{weekdayLabel(d)}</span>
            <span className={`cp-daynum ${d === today ? 'is-today' : ''}`}>{dateParts(d)[2]}</span>
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
          // 전날에 시작하면(음수) 이 날 0시부터 보이는 부분만
          top: px(Math.max(0, ghost)),
          height: px(Math.min(ghost + len, MINUTES_PER_DAY) - Math.max(0, ghost)),
          borderLeftColor: drag.event.color,
        }}
      >
        <span className="cp-chip-time">
          {minutesToTime(((ghost % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY)}
        </span>
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
        // 잘린 칸의 위쪽이 아니라 일정의 실제 시작부터 잰다(전날 시작이면 그날 0시 이전)
        const startMin =
          s.event.startUtc < localDayStart(date)
            ? (s.event.startUtc - localDayStart(date)) / 60_000
            : s.startMin
        const grabFrom = (clientY: number, el: HTMLElement) => {
          const col = el.closest<HTMLElement>('.cp-col')!.getBoundingClientRect()
          return ((clientY - col.top) / col.height) * MINUTES_PER_DAY - startMin
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
