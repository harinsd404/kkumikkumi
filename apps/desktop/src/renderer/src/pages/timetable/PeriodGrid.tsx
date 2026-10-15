import type { TimetableEntry } from '@kkumikkumi/schema'
import { cellEntry, currentPeriod, DAY_LABEL, entryColor } from '../../board/timetable'
import { DayHead } from './DayHead'
import type { Colors, GridProps, Sel } from './common'

/** 교시 방식: 요일 × 교시 칸 */
export function PeriodGrid({
  colors,
  settings: s,
  entries,
  days,
  today,
  minute,
  sel,
  onSelect,
}: GridProps) {
  const nowPeriod = currentPeriod(s.periods, minute)
  return (
    <div
      className="tt-table"
      role="grid"
      style={{ gridTemplateColumns: `72px repeat(${days.length}, minmax(0, 1fr))` }}
    >
      <div />
      {days.map((d) => (
        <DayHead key={d} day={d} today={today} />
      ))}
      {s.periods.map((p, i) => (
        <PeriodRow
          key={i}
          period={i + 1}
          time={p}
          days={days}
          entries={entries}
          colors={colors}
          isNowRow={nowPeriod === i}
          today={today}
          sel={sel}
          onSelect={onSelect}
        />
      ))}
    </div>
  )
}

function PeriodRow(props: {
  period: number
  time: { start: string; end: string }
  days: number[]
  entries: readonly TimetableEntry[]
  colors: Colors
  isNowRow: boolean
  today: number
  sel: Sel | null
  onSelect(sel: Sel): void
}) {
  const { period, time, days, entries, sel } = props
  return (
    <>
      <div className="tt-rowhead" role="rowheader">
        <strong>{period}교시</strong>
        <span>{time.start}</span>
      </div>
      {days.map((d) => {
        const e = cellEntry(entries, d, period)
        const selected = sel?.kind === 'cell' && sel.day === d && sel.period === period
        const now = props.isNowRow && d === props.today
        return (
          <button
            key={d}
            type="button"
            role="gridcell"
            className={`tt-cell ${e ? 'is-filled' : ''} ${selected ? 'is-selected' : ''} ${now ? 'is-now' : ''}`}
            style={
              e ? { background: entryColor(e, props.colors.auto, props.colors.tones) } : undefined
            }
            aria-label={`${DAY_LABEL[d]}요일 ${period}교시${e ? ` ${e.subject}` : ' 비어 있음'}`}
            onClick={() => props.onSelect({ kind: 'cell', day: d, period })}
          >
            {e && (
              <>
                <span className="tt-subject">{e.subject}</span>
                {e.room && <span className="tt-room">{e.room}</span>}
              </>
            )}
          </button>
        )
      })}
    </>
  )
}
