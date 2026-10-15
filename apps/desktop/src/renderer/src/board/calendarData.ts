import type { CalendarEvent, TodoItem } from '@kkumikkumi/schema'
import { useEffect, useState } from 'react'
import type { BoardActions } from './BoardContext'
import { eventsByDay, rangeForDays } from './calendar'

export interface DayData {
  events: Map<string, CalendarEvent[]>
  todos: Map<string, TodoItem[]>
}

/** 보이는 날짜 구간의 일정과 마감 투두. data.version이 바뀌면(일정/투두 변경) 다시 읽는다. */
export function useDayData(
  days: readonly string[],
  actions: BoardActions | undefined,
  version: number,
) {
  const first = days[0]
  const last = days[days.length - 1]
  const [state, setState] = useState<{ events: CalendarEvent[]; todos: TodoItem[] }>()
  useEffect(() => {
    if (!actions || !first || !last) return
    let alive = true
    void Promise.all([
      actions.calendar.range(rangeForDays(first, last)),
      actions.calendar.dueTodos(first, last),
    ]).then(([events, todos]) => {
      if (alive) setState({ events, todos })
    })
    return () => {
      alive = false
    }
  }, [actions, first, last, version])
  return dayMaps(days, state?.events ?? [], state?.todos ?? [])
}

function dayMaps(days: readonly string[], events: CalendarEvent[], todos: TodoItem[]): DayData {
  const todoMap = new Map<string, TodoItem[]>(days.map((d) => [d, []]))
  for (const t of todos) if (t.dueDate) todoMap.get(t.dueDate)?.push(t)
  return { events: eventsByDay(events, days), todos: todoMap }
}
