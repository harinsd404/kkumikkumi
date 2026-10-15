import type { CalendarEvent, TodoItem } from '@kkumikkumi/schema'
import type { BoardActions } from '../../board/BoardContext'
import { timeLabel } from '../../board/calendar'
import { TodoCheck } from '../../ui/TodoCheck'
import { monthDayKo, weekdayLabel } from '../dateText'

/** 오른쪽: 고른 날의 일정(종일 먼저)과 마감 할 일 */
export function Agenda({
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
          {monthDayKo(date)} ({weekdayLabel(date)})
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
                    <TodoCheck item={t} actions={actions} />
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
