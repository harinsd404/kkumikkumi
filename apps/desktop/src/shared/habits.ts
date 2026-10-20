// 습관 계산(순수 함수). main(MCP)과 화면이 같이 쓴다. 날짜는 로컬 'YYYY-MM-DD'.

const parse = (date: string) => date.split('-').map(Number) as [number, number, number]
const iso = (dt: Date) =>
  `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`

export const addDays = (date: string, n: number): string => {
  const [y, m, d] = parse(date)
  return iso(new Date(y, m - 1, d + n))
}

/** 0=일 … 6=토 */
export const weekdayOf = (date: string): number => {
  const [y, m, d] = parse(date)
  return new Date(y, m - 1, d).getDay()
}

export const EVERY_DAY = 127
/** 요일 비트에서 그 요일을 하는가 */
export const hasDay = (days: number, weekday: number) => ((days >> weekday) & 1) === 1
export const isScheduled = (days: number, date: string) => hasDay(days, weekdayOf(date))
export const toggleDay = (days: number, weekday: number) => days ^ (1 << weekday)

/** 요일 비트를 사람이 읽는 말로: "매일", "평일", "주말", "월·수·금" */
export function daysLabel(days: number): string {
  if (days === EVERY_DAY) return '매일'
  if (days === 0b0111110) return '평일'
  if (days === 0b1000001) return '주말'
  return [1, 2, 3, 4, 5, 6, 0]
    .filter((w) => hasDay(days, w))
    .map((w) => '일월화수목금토'[w])
    .join('·')
}

/** 연속 기록 계산 상한(그 이상은 같은 값으로 본다) */
const STREAK_LIMIT = 400

/**
 * 연속 기록: 오늘부터 거꾸로, 하는 요일만 보고 체크가 이어진 수. 하지 않는 요일은 건너뛴다.
 * 오늘이 하는 요일인데 아직 안 했으면 어제부터 센다(하루가 끝나기 전에 0으로 끊기지 않도록).
 */
export function habitStreak(
  days: number,
  checked: (date: string) => boolean,
  today: string,
): number {
  let d = today
  if (isScheduled(days, d) && !checked(d)) d = addDays(d, -1)
  let n = 0
  for (let i = 0; i < STREAK_LIMIT; i++, d = addDays(d, -1)) {
    if (!isScheduled(days, d)) continue
    if (!checked(d)) break
    n++
  }
  return n
}

/** 그날 해야 하는 습관 중 한 것 / 전체 */
export function dayProgress(
  habits: readonly { id: string; days: number }[],
  checked: (habitId: string, date: string) => boolean,
  date: string,
): { done: number; total: number } {
  const due = habits.filter((h) => isScheduled(h.days, date))
  return { done: due.filter((h) => checked(h.id, date)).length, total: due.length }
}

/** 체크 집합 키 */
export const checkKey = (habitId: string, date: string) => `${habitId}|${date}`
