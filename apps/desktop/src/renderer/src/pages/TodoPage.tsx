import type { CalendarEvent } from '@kkumikkumi/schema'
import { useMemo, useState } from 'react'
import './pages.css'
import type { BoardActions, TodoData } from '../board/BoardContext'
import { localDate, timeLabel, type EventInput } from '../board/calendar'
import { useDayData } from '../board/calendarData'
import type { UserData } from '../app/useUserData'
import { CalendarPage } from './CalendarPage'
import { shiftAnchor, titleFor, visibleDays } from './calendarView'
import { monthDayKo, weekdayLabel } from './dateText'
import { CategoryList } from './todo/CategoryList'
import { MiniMonth } from './todo/MiniMonth'
import { dueForView, remainingByDay, VIEW_LABEL, viewSections, type TodoView } from './todoView'

interface Props {
  todos: TodoData | undefined
  actions: BoardActions
  lists: UserData['lists']
  palette: { accent: string; check: string }
  now: Date
  /** 사용자 데이터가 바뀔 때마다 증가(일정 다시 조회) */
  version: number
  weekStartsOn: 0 | 1
  updateEvent(id: string, e: EventInput): Promise<boolean>
  /** 달력 크게 보기(참고: 2026-10-16 사용자 지시 이미지 2) */
  big: boolean
  onBig(big: boolean): void
}

const VIEWS: TodoView[] = ['day', 'all', 'done']
const EMPTY_TEXT: Record<TodoView, string> = {
  day: '이 날 할 일이 없어요. 카테고리의 + 로 추가해 보세요',
  all: '남은 할 일이 없어요',
  done: '완료한 할 일이 없어요',
}

/**
 * 할 일 화면(할 일 + 캘린더, 2026-10-16 사용자 지시). 왼쪽 작은 달력(날짜별 남은 할 일 수),
 * 오른쪽 고른 날의 일정과 카테고리별 할 일. 달력 크게 보기로 바꾸면 월/주/일 캘린더.
 */
export function TodoPage(p: Props) {
  const { todos, actions, now, weekStartsOn } = p
  const today = localDate(now.getTime())
  const [date, setDate] = useState(today)
  /** 작은 달력이 보여 주는 달(그 달의 아무 날짜) */
  const [month, setMonth] = useState(today)
  const [view, setView] = useState<TodoView>('day')
  const [query, setQuery] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)

  const pick = (d: string) => {
    setDate(d)
    setMonth(d)
  }

  if (p.big)
    return (
      <CalendarPage
        actions={actions}
        version={p.version}
        now={now}
        weekStartsOn={weekStartsOn}
        updateEvent={p.updateEvent}
        anchor={date}
        onAnchor={pick}
        headerExtra={
          <button type="button" className="pg-pill" onClick={() => p.onBig(false)}>
            할 일과 같이 보기
          </button>
        }
      />
    )

  return (
    <SplitView
      {...p}
      today={today}
      date={date}
      month={month}
      view={view}
      query={query}
      openId={openId}
      onPick={(d) => {
        pick(d)
        setView('day')
      }}
      onMonth={setMonth}
      onView={setView}
      onQuery={setQuery}
      onOpen={setOpenId}
      todos={todos}
    />
  )
}

function SplitView({
  todos,
  actions,
  lists,
  palette,
  version,
  weekStartsOn,
  onBig,
  today,
  date,
  month,
  view,
  query,
  openId,
  onPick,
  onMonth,
  onView,
  onQuery,
  onOpen,
}: Props & {
  today: string
  date: string
  month: string
  view: TodoView
  query: string
  openId: string | null
  onPick(date: string): void
  onMonth(month: string): void
  onView(v: TodoView): void
  onQuery(q: string): void
  onOpen(id: string | null): void
}) {
  const days = visibleDays('month', month, weekStartsOn)
  const dayData = useDayData(days, actions, version)
  const counts = useMemo(() => remainingByDay(todos?.items ?? {}), [todos])
  const sections = todos ? viewSections(todos.lists, todos.items, view, date, today, query) : []
  const dayEvents = dayData.events.get(date) ?? []
  const empty = sections.every((s) => s.items.length === 0)

  return (
    <div className="pg tdo">
      <section className="pg-card tdo-cal" aria-label="달력">
        <header className="pg-head">
          <h1 className="pg-title">{titleFor('month', month, days)}</h1>
          <div className="pg-tabs">
            <button
              type="button"
              className="pg-pill pg-round"
              aria-label="이전 달"
              onClick={() => onMonth(shiftAnchor(month, 'month', -1))}
            >
              ‹
            </button>
            <button type="button" className="pg-pill" onClick={() => onPick(today)}>
              오늘
            </button>
            <button
              type="button"
              className="pg-pill pg-round"
              aria-label="다음 달"
              onClick={() => onMonth(shiftAnchor(month, 'month', 1))}
            >
              ›
            </button>
          </div>
        </header>
        <MiniMonth
          month={month}
          selected={date}
          today={today}
          weekStartsOn={weekStartsOn}
          counts={counts}
          events={dayData.events}
          onSelect={onPick}
        />
        <button type="button" className="pg-pill tdo-big" onClick={() => onBig(true)}>
          달력 크게 보기 (월·주·일)
        </button>
      </section>

      <section className="pg-card tdo-main" aria-label="할 일">
        <header className="pg-head">
          <h1 className="pg-title">
            {view === 'day' ? `${monthDayKo(date)} (${weekdayLabel(date)})` : '할 일'}
          </h1>
          <input
            className="pg-input pg-search"
            type="search"
            placeholder="검색"
            aria-label="할 일 검색"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
          />
        </header>
        <div className="pg-tabs" role="tablist" aria-label="보기">
          {VIEWS.map((v) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={view === v}
              className="pg-pill"
              onClick={() => onView(v)}
            >
              {VIEW_LABEL[v]}
            </button>
          ))}
        </div>

        <div className="tdo-scroll">
          {view === 'day' && <DayEvents date={date} events={dayEvents} actions={actions} />}
          {todos && (
            <CategoryList
              sections={sections}
              view={view}
              date={date}
              today={today}
              palette={palette}
              allLists={todos.lists}
              actions={actions}
              lists={lists}
              openId={openId}
              onOpen={onOpen}
              addDue={dueForView(view, date)}
            />
          )}
          {empty && (
            <p className="pg-empty">{query.trim() ? '찾는 할 일이 없어요' : EMPTY_TEXT[view]}</p>
          )}
        </div>
      </section>
    </div>
  )
}

/** 고른 날의 일정(종일 먼저). 누르면 일정 창, + 일정으로 추가 */
function DayEvents({
  date,
  events,
  actions,
}: {
  date: string
  events: readonly CalendarEvent[]
  actions: BoardActions
}) {
  const sorted = [...events.filter((e) => e.allDay), ...events.filter((e) => !e.allDay)]
  return (
    <section className="tdo-events" aria-label="일정">
      <h2 className="pg-chip">일정</h2>
      <div className="tdo-event-row">
        {sorted.map((e) => (
          <button
            key={e.id}
            type="button"
            className="tdo-event"
            style={{ borderLeftColor: e.color }}
            onClick={() => actions.calendar.openEditor({ event: e })}
          >
            <span className="tdo-event-time">{e.allDay ? '종일' : timeLabel(e.startUtc)}</span>
            {e.title}
          </button>
        ))}
        <button
          type="button"
          className="pg-pill"
          onClick={() => actions.calendar.openEditor({ date })}
        >
          + 일정
        </button>
      </div>
    </section>
  )
}
