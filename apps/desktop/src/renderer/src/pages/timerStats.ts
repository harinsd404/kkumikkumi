import { addDays, localDate } from '../board/calendar'

// 타이머 기록 통계(순수 함수). 기록은 끝난 시각의 로컬 날짜로 센다(자정을 넘긴 집중은 끝난 날에 들어간다).

interface SessionLike {
  kind: 'focus' | 'break'
  endedAt: number
  actualMs: number
  completed: boolean
}

/** 날짜별 집중 시간(ms). days에 없는 날은 무시. */
export function focusByDay(sessions: readonly SessionLike[], days: readonly string[]) {
  const out = new Map<string, number>(days.map((d) => [d, 0]))
  for (const s of sessions) {
    if (s.kind !== 'focus') continue
    const d = localDate(s.endedAt)
    const cur = out.get(d)
    if (cur !== undefined) out.set(d, cur + s.actualMs)
  }
  return out
}

interface TimerSummary {
  todayMs: number
  weekMs: number
  /** 오늘 끝까지 마친 집중 횟수 */
  todayDone: number
}

export function summarize(
  sessions: readonly SessionLike[],
  today: string,
  weekDays: readonly string[],
): TimerSummary {
  const week = focusByDay(sessions, weekDays)
  return {
    todayMs: focusByDay(sessions, [today]).get(today) ?? 0,
    weekMs: [...week.values()].reduce((a, b) => a + b, 0),
    todayDone: sessions.filter(
      (s) => s.kind === 'focus' && s.completed && localDate(s.endedAt) === today,
    ).length,
  }
}

/** 오늘까지 최근 n일(오래된 날부터) */
export const lastDays = (today: string, n: number) =>
  Array.from({ length: n }, (_, i) => addDays(today, i - n + 1))

/** "1시간 5분" / "25분" / "0분" (분은 버림) */
export function formatDuration(ms: number): string {
  const min = Math.floor(Math.max(0, ms) / 60_000)
  const h = Math.floor(min / 60)
  const m = min % 60
  if (h === 0) return `${m}분`
  return m === 0 ? `${h}시간` : `${h}시간 ${m}분`
}
