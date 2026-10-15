import type { CalendarEvent, TodoItem } from '@kkumikkumi/schema'
import { monthGrid, weekdayLabels } from '../../board/calendar'
import { dateParts } from '../dateText'
import { EventChip, TodoChip } from './chips'
import type { Bind, Drag } from './useEventDrag'

const MONTH_CHIPS = 3

/** 월 보기: 칸마다 일정·할 일 몇 개와 "+N". 누르면 그날을 고르고 두 번 누르면 일정 추가. */
export function MonthView({
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
  const [y, m] = dateParts(anchor)
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
