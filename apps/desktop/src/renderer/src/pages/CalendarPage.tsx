import { useState } from 'react'
import type { BoardActions } from '../board/BoardContext'
import { localDate, type EventInput } from '../board/calendar'
import { useDayData } from '../board/calendarData'
import { Agenda } from './calendar/Agenda'
import { MonthView } from './calendar/MonthView'
import { TimeView } from './calendar/TimeView'
import { useEventDrag } from './calendar/useEventDrag'
import { shiftAnchor, titleFor, visibleDays, type CalView } from './calendarView'
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
