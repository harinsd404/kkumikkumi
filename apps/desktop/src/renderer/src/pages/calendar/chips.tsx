import type { CalendarEvent, TodoItem } from '@kkumikkumi/schema'
import { timeLabel } from '../../board/calendar'
import type { Bind } from './useEventDrag'

/** 월 칸·종일 줄의 일정(끌어서 옮기기, 눌러서 고치기) */
export function EventChip({
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

/** 마감일 있는 할 일(읽기 전용) */
export function TodoChip({ t }: { t: TodoItem }) {
  return (
    <div className={`cp-chip cp-chip--todo ${t.done ? 'is-done' : ''}`} title={t.title}>
      {t.title}
    </div>
  )
}
