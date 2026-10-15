import { weekdayLabels } from '../board/calendar'

// 세부 페이지의 날짜 문자열(YYYY-MM-DD) 풀기와 짧은 표기(순수 함수, 달력 산술이라 DST 무관).

/** 'YYYY-MM-DD' → [연, 월(1~12), 일] */
export const dateParts = (date: string) => date.split('-').map(Number) as [number, number, number]

const DOW = weekdayLabels(0)

/** 요일 한 글자('일'~'토') */
export function weekdayLabel(date: string): string {
  const [y, m, d] = dateParts(date)
  return DOW[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]!
}

/** "10/13" */
export function monthDay(date: string): string {
  const [, m, d] = dateParts(date)
  return `${m}/${d}`
}

/** "10월 13일" */
export function monthDayKo(date: string): string {
  const [, m, d] = dateParts(date)
  return `${m}월 ${d}일`
}
