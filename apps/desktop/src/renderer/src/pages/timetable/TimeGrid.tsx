import type { MouseEvent } from 'react'
import {
  dayItems,
  entryColor,
  fromMin,
  hourRange,
  isNow,
  layoutColumns,
} from '../../board/timetable'
import { DayHead } from './DayHead'
import type { GridProps } from './common'

const HOUR_PX = 56
const SNAP_MIN = 30

/** 시간 방식: 요일 × 시각 표. 빈 곳을 두 번 누르면 그 시각에 새 수업. */
export function TimeGrid({
  colors,
  settings: s,
  entries,
  days,
  today,
  minute,
  sel,
  onSelect,
}: GridProps) {
  const perDay = days.map((d) => dayItems(entries, s, d))
  const [from, to] = hourRange(perDay.flat())
  const cols = `56px repeat(${days.length}, minmax(0, 1fr))`

  const addAt = (day: number, e: MouseEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return
    const y = e.clientY - e.currentTarget.getBoundingClientRect().top
    const start = Math.min(
      23 * 60,
      Math.floor((from * 60 + (y / HOUR_PX) * 60) / SNAP_MIN) * SNAP_MIN,
    )
    onSelect({
      kind: 'new',
      slot: {
        kind: 'time',
        day,
        start: fromMin(start),
        end: fromMin(Math.min(start + 60, 23 * 60 + 59)),
      },
    })
  }

  return (
    <div className="tt-time">
      <div className="tt-time-head" style={{ gridTemplateColumns: cols }}>
        <div />
        {days.map((d) => (
          <DayHead key={d} day={d} today={today} />
        ))}
      </div>
      <div className="tt-scroll">
        <div
          className="tt-time-body"
          style={{ gridTemplateColumns: cols, height: (to - from) * HOUR_PX }}
        >
          <div className="tt-hours">
            {Array.from({ length: to - from }, (_, i) => (
              <span key={i} style={{ top: i * HOUR_PX }}>
                {from + i}시
              </span>
            ))}
          </div>
          {days.map((d, di) => (
            <div
              key={d}
              className={`tt-col ${d === today ? 'is-today' : ''}`}
              style={{ backgroundSize: `100% ${HOUR_PX}px` }}
              onDoubleClick={(e) => addAt(d, e)}
              title="두 번 눌러 수업 추가"
            >
              {layoutColumns(perDay[di]!).map(({ item, startMin, endMin, col, cols: n }) => {
                const e = item.entry
                const selected = sel?.kind === 'entry' && sel.id === e.id
                return (
                  <button
                    key={e.id}
                    type="button"
                    className={`tt-block ${selected ? 'is-selected' : ''} ${
                      d === today && isNow(item, minute) ? 'is-now' : ''
                    }`}
                    style={{
                      top: ((startMin - from * 60) / 60) * HOUR_PX,
                      height: Math.max(18, ((endMin - startMin) / 60) * HOUR_PX - 2),
                      left: `calc(${(col / n) * 100}% + 2px)`,
                      width: `calc(${100 / n}% - 4px)`,
                      background: entryColor(e, colors.auto, colors.tones),
                    }}
                    onClick={() => onSelect({ kind: 'entry', id: e.id })}
                  >
                    <span className="tt-subject">{e.subject}</span>
                    <span className="tt-room">
                      {item.start}–{item.end}
                      {e.room && ` · ${e.room}`}
                    </span>
                  </button>
                )
              })}
              {d === today && minute >= from * 60 && minute < to * 60 && (
                <div
                  className="tt-nowline"
                  style={{ top: ((minute - from * 60) / 60) * HOUR_PX }}
                />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
