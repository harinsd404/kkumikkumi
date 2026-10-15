import type { CalendarEvent } from '@kkumikkumi/schema'
import { eventSpan } from './calendar'

// 디데이 계산(순수 함수). 날짜는 로컬 날짜 문자열(YYYY-MM-DD)끼리 달력 산술로 센다(DST 무관).

const dayNumber = (date: string): number => {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  return Date.UTC(y, m - 1, d) / 86_400_000
}

/** a → b 까지 며칠(b가 나중이면 양수) */
export const daysBetween = (a: string, b: string): number => dayNumber(b) - dayNumber(a)

export interface Dday {
  /** 남은 날(양수) / 0(오늘·진행 중) / 지난 날(음수, 시작일 기준) */
  diff: number
  label: string
  /** 여러 날 일정이 오늘 진행 중 */
  ongoing: boolean
}

/**
 * 일정의 디데이. 시작 전이면 D-N, 시작일~마지막 날이면 D-DAY, 끝났으면 시작일부터 센 D+N.
 * 시각 일정은 이 컴퓨터 시간대의 날짜로 본다(자정에 끝나면 전날까지).
 */
export function ddayOf(e: CalendarEvent, today: string): Dday {
  const { first, last } = eventSpan(e)
  if (today < first) {
    const n = daysBetween(today, first)
    return { diff: n, label: `D-${n}`, ongoing: false }
  }
  if (today <= last) return { diff: 0, label: 'D-DAY', ongoing: first !== last }
  const n = daysBetween(first, today)
  return { diff: -n, label: `D+${n}`, ongoing: false }
}

/** 다가오는 일정 정렬: 시작 날짜 → 종일 먼저 → 시작 시각 → 제목 */
export function sortUpcoming(events: readonly CalendarEvent[]): CalendarEvent[] {
  const key = (e: CalendarEvent) => eventSpan(e).first
  return [...events].sort((a, b) => {
    const ka = key(a)
    const kb = key(b)
    if (ka !== kb) return ka < kb ? -1 : 1
    if (a.allDay !== b.allDay) return a.allDay ? -1 : 1
    if (!a.allDay && !b.allDay && a.startUtc !== b.startUtc) return a.startUtc - b.startUtc
    return a.title.localeCompare(b.title, 'ko')
  })
}

/** "12월 1일 (화)", 여러 날이면 "12월 1일 (화) ~ 12월 3일 (목)" */
export function ddayDateLabel(e: CalendarEvent): string {
  const { first, last } = eventSpan(e)
  const one = (date: string) => {
    const [y, m, d] = date.split('-').map(Number) as [number, number, number]
    const wd = '일월화수목금토'[new Date(y, m - 1, d).getDay()]
    return `${m}월 ${d}일 (${wd})`
  }
  return first === last ? one(first) : `${one(first)} ~ ${one(last)}`
}
