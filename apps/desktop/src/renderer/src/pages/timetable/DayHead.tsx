import { DAY_LABEL } from '../../board/timetable'

/** 요일 머리(오늘은 강조) */
export function DayHead({ day, today }: { day: number; today: number }) {
  return (
    <div className={`tt-dayhead ${day === today ? 'is-today' : ''}`} role="columnheader">
      {DAY_LABEL[day]}
    </div>
  )
}
