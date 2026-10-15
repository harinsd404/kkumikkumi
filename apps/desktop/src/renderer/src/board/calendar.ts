export interface DayCell {
  /** YYYY-MM-DD (로컬 날짜) */
  date: string
  day: number
  inMonth: boolean
}

const pad = (n: number) => String(n).padStart(2, '0')
const iso = (y: number, m0: number, d: number) => `${y}-${pad(m0 + 1)}-${pad(d)}`

/**
 * 월 달력 행렬(순수 함수). month0: 0~11, weekStartsOn: 0=일요일, 1=월요일.
 * 이번 달 날짜를 덮는 최소 주 수(4~6주)만 만든다. 날짜 계산은 UTC 산술로 해서 DST 영향을 받지 않는다.
 */
export function monthGrid(year: number, month0: number, weekStartsOn: 0 | 1): DayCell[][] {
  const first = new Date(Date.UTC(year, month0, 1))
  const daysInMonth = new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate()
  const lead = (first.getUTCDay() - weekStartsOn + 7) % 7
  const weeks = Math.ceil((lead + daysInMonth) / 7)
  const out: DayCell[][] = []
  for (let w = 0; w < weeks; w++) {
    const row: DayCell[] = []
    for (let i = 0; i < 7; i++) {
      const d = new Date(Date.UTC(year, month0, 1 - lead + w * 7 + i))
      row.push({
        date: iso(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
        day: d.getUTCDate(),
        inMonth: d.getUTCMonth() === month0,
      })
    }
    out.push(row)
  }
  return out
}

const LABELS = ['일', '월', '화', '수', '목', '금', '토'] as const

export const weekdayLabels = (weekStartsOn: 0 | 1): string[] =>
  Array.from({ length: 7 }, (_, i) => LABELS[(i + weekStartsOn) % 7]!)

/** 주어진 날짜가 속한 주(7일) */
export function weekOf(year: number, month0: number, day: number, weekStartsOn: 0 | 1): DayCell[] {
  const base = new Date(Date.UTC(year, month0, day))
  const lead = (base.getUTCDay() - weekStartsOn + 7) % 7
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(Date.UTC(year, month0, day - lead + i))
    return {
      date: iso(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
      day: d.getUTCDate(),
      inMonth: d.getUTCMonth() === month0,
    }
  })
}

export const shiftMonth = (year: number, month0: number, delta: number) => {
  const d = new Date(Date.UTC(year, month0 + delta, 1))
  return { year: d.getUTCFullYear(), month0: d.getUTCMonth() }
}

/* ───────── 일정 배치 (시스템 타임존 기준, 순수 함수) ───────── */
// 시각 일정은 UTC(ms)로 저장되고, 화면에는 지금 시스템 타임존의 로컬 날짜/시각으로 보인다.
// 로컬 자정은 new Date(y, m, d)로 구해 DST(23/25시간인 날)를 그대로 반영한다.

export interface CalendarRangeQuery {
  fromUtc: number
  toUtc: number
  fromDate: string
  toDate: string
}

/** 'YYYY-MM-DD' → 연, 월(0~11), 일 */
export const parseDate = (date: string) => {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  return { y, m0: m - 1, d }
}

/** 'YYYY-MM-DD' → 월(1~12), 일 */
export const monthDay = (date: string) => {
  const { m0, d } = parseDate(date)
  return { m: m0 + 1, d }
}

/** DateStr에 n일 더하기(달력 산술이라 DST 무관) */
export function addDays(date: string, n: number): string {
  const { y, m0, d } = parseDate(date)
  const t = new Date(Date.UTC(y, m0, d + n))
  return iso(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate())
}

/** 로컬 날짜의 자정(ms) */
export function localDayStart(date: string): number {
  const { y, m0, d } = parseDate(date)
  return new Date(y, m0, d).getTime()
}

/** ms → 로컬 날짜 */
export function localDate(ms: number): string {
  const t = new Date(ms)
  return iso(t.getFullYear(), t.getMonth(), t.getDate())
}

/** 화면에 보이는 날짜 구간(포함) → 조회 범위 */
export function rangeForDays(first: string, last: string): CalendarRangeQuery {
  return {
    fromUtc: localDayStart(first),
    toUtc: localDayStart(addDays(last, 1)),
    fromDate: first,
    toDate: last,
  }
}

type EventLike =
  | { allDay: true; startDate: string; endDate: string; title: string }
  | { allDay: false; startUtc: number; endUtc: number; title: string }

/** 일정이 걸쳐 있는 로컬 날짜들(첫날~마지막날). 시각 일정의 끝은 배타적(자정에 끝나면 전날까지). */
export function eventSpan(e: EventLike): { first: string; last: string } {
  if (e.allDay) return { first: e.startDate, last: e.endDate }
  const first = localDate(e.startUtc)
  const last = e.endUtc > e.startUtc ? localDate(e.endUtc - 1) : first
  return { first, last }
}

const sortKey = (e: EventLike) => (e.allDay ? -Infinity : e.startUtc)

/** 날짜별 일정. days에 없는 날은 무시한다. 종일 일정 먼저, 그다음 시작 시각, 같으면 제목 순. */
export function eventsByDay<E extends EventLike>(events: readonly E[], days: readonly string[]) {
  const out = new Map<string, E[]>(days.map((d) => [d, []]))
  if (days.length === 0) return out
  const lo = days[0]!
  const hi = days[days.length - 1]!
  for (const e of events) {
    const { first, last } = eventSpan(e)
    for (let d = first < lo ? lo : first; d <= last && d <= hi; d = addDays(d, 1)) {
      out.get(d)?.push(e)
    }
  }
  for (const list of out.values()) {
    list.sort((a, b) => sortKey(a) - sortKey(b) || a.title.localeCompare(b.title))
  }
  return out
}

const pad2 = (n: number) => String(n).padStart(2, '0')

/** ms → 로컬 'HH:mm' */
export const timeLabel = (ms: number) => {
  const t = new Date(ms)
  return `${pad2(t.getHours())}:${pad2(t.getMinutes())}`
}

/** 로컬 날짜 + 'HH:mm' → ms. DST로 없는 시각(봄 01:30 등)은 Date 규칙대로 앞으로 밀린다. */
export function localDateTime(date: string, time: string): number {
  const { y, m0, d } = parseDate(date)
  const [h, mi] = time.split(':').map(Number) as [number, number]
  return new Date(y, m0, d, h, mi).getTime()
}

export const systemTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone

/* ───────── 일정 입력 폼 → 저장할 일정 (순수 함수) ───────── */

export interface EventForm {
  title: string
  allDay: boolean
  startDate: string
  endDate: string
  /** 'HH:mm' (allDay면 무시) */
  startTime: string
  endTime: string
  color: string
  note: string
}

export type EventInput =
  | { allDay: true; title: string; color: string; note: string; startDate: string; endDate: string }
  | {
      allDay: false
      title: string
      color: string
      note: string
      startUtc: number
      endUtc: number
      tzid: string
    }

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

export function formToEvent(
  f: EventForm,
  tzid: string,
): { ok: true; event: EventInput } | { ok: false; error: string } {
  const title = f.title.trim()
  if (!title) return { ok: false, error: '제목을 입력해 주세요' }
  if (title.length > 200) return { ok: false, error: '제목은 200자까지예요' }
  if (f.note.length > 2000) return { ok: false, error: '메모는 2000자까지예요' }
  if (!DATE_RE.test(f.startDate) || !DATE_RE.test(f.endDate))
    return { ok: false, error: '날짜를 확인해 주세요' }
  const base = { title, color: f.color, note: f.note }
  if (f.allDay) {
    if (f.endDate < f.startDate) return { ok: false, error: '끝나는 날이 시작보다 빨라요' }
    return {
      ok: true,
      event: { ...base, allDay: true, startDate: f.startDate, endDate: f.endDate },
    }
  }
  if (!TIME_RE.test(f.startTime) || !TIME_RE.test(f.endTime))
    return { ok: false, error: '시각을 확인해 주세요' }
  const startUtc = localDateTime(f.startDate, f.startTime)
  const endUtc = localDateTime(f.endDate, f.endTime)
  if (endUtc < startUtc) return { ok: false, error: '끝나는 시각이 시작보다 빨라요' }
  return { ok: true, event: { ...base, allDay: false, startUtc, endUtc, tzid } }
}

/** 저장된 일정 → 폼 초기값(지금 시스템 타임존 기준) */
export function eventToForm(e: EventInput): EventForm {
  const base = { title: e.title, color: e.color, note: e.note }
  if (e.allDay)
    return {
      ...base,
      allDay: true,
      startDate: e.startDate,
      endDate: e.endDate,
      startTime: '09:00',
      endTime: '10:00',
    }
  return {
    ...base,
    allDay: false,
    startDate: localDate(e.startUtc),
    endDate: localDate(e.endUtc),
    startTime: timeLabel(e.startUtc),
    endTime: timeLabel(e.endUtc),
  }
}
