import type { CalendarEvent, Sprint } from '@kkumikkumi/schema'
import { sprintsOn } from '../../board/sprint'
import { monthGrid, weekdayLabels } from '../../board/calendar'
import { dateParts } from '../dateText'

/**
 * 작은 달력(할 일 화면 왼쪽): 칸마다 남은 할 일 수 배지와 날짜. 일정이 있으면 날짜 아래 점.
 * 누르면 그날을 고른다(다른 달 칸이면 그 달로 넘어간다).
 */
export function MiniMonth({
  month,
  selected,
  today,
  weekStartsOn,
  counts,
  events,
  sprints,
  onSelect,
}: {
  /** 보여 줄 달의 아무 날짜 */
  month: string
  selected: string
  today: string
  weekStartsOn: 0 | 1
  /** 날짜 → 남은 할 일 수 */
  counts: ReadonlyMap<string, number>
  events: ReadonlyMap<string, readonly CalendarEvent[]>
  /** 기간이 걸친 날 아래에 색 줄 */
  sprints: readonly Sprint[]
  onSelect(date: string): void
}) {
  const [y, m] = dateParts(month)
  const weeks = monthGrid(y, m - 1, weekStartsOn)
  return (
    <div className="tdo-month" role="grid" aria-label={`${y}년 ${m}월`}>
      {weekdayLabels(weekStartsOn).map((l) => (
        <div key={l} className="tdo-dow" role="columnheader">
          {l}
        </div>
      ))}
      {weeks.flat().map((c) => {
        const n = counts.get(c.date) ?? 0
        const evs = events.get(c.date) ?? []
        return (
          <button
            key={c.date}
            type="button"
            role="gridcell"
            className={[
              'tdo-day',
              c.inMonth ? '' : 'is-out',
              c.date === selected ? 'is-selected' : '',
              c.date === today ? 'is-today' : '',
            ].join(' ')}
            aria-selected={c.date === selected}
            aria-label={`${c.day}일${n ? `, 할 일 ${n}개` : ''}${evs.length ? `, 일정 ${evs.length}개` : ''}`}
            onClick={() => onSelect(c.date)}
          >
            <span className={`tdo-badge ${n ? 'has-count' : ''}`} aria-hidden>
              {n > 0 ? (n > 99 ? '99+' : n) : ''}
            </span>
            <span className="tdo-daynum">{c.day}</span>
            <span className="tdo-spans" aria-hidden>
              {sprintsOn(sprints, c.date)
                .slice(0, 2)
                .map((s) => (
                  <span
                    key={s.id}
                    className={[
                      c.date === s.startDate ? 'is-start' : '',
                      c.date === s.endDate ? 'is-end' : '',
                    ].join(' ')}
                    style={{ background: s.color }}
                  />
                ))}
            </span>
            <span className="tdo-dots" aria-hidden>
              {evs.slice(0, 3).map((e) => (
                <span key={e.id} style={{ background: e.color }} />
              ))}
            </span>
          </button>
        )
      })}
    </div>
  )
}
