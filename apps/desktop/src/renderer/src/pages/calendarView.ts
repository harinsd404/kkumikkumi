import {
  addDays,
  localDate,
  localDateTime,
  localDayStart,
  type EventInput,
} from '../board/calendar'

// 캘린더 세부 페이지의 날짜 이동, 일정 옮기기, 시간 칸 배치(순수 함수).
// 시각은 모두 "지금 시스템 타임존의 벽시계" 기준이다. DST가 바뀌는 날은 하루가 23/25시간이 될 수 있다.

export type CalView = 'month' | 'week' | 'day'
export const MINUTES_PER_DAY = 24 * 60
export const SNAP_MIN = 15

const parse = (date: string) => date.split('-').map(Number) as [number, number, number]

/** a → b 사이의 날짜 수(달력 기준, DST 무관) */
export function dayDiff(a: string, b: string): number {
  const [ay, am, ad] = parse(a)
  const [by, bm, bd] = parse(b)
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000)
}

/** 같은 날 몇 일 뒤/앞(월말은 그 달 마지막 날로 맞춤) */
export function shiftAnchor(date: string, view: CalView, delta: number): string {
  if (view === 'day') return addDays(date, delta)
  if (view === 'week') return addDays(date, delta * 7)
  const [y, m, d] = parse(date)
  const last = new Date(Date.UTC(y, m - 1 + delta + 1, 0)).getUTCDate()
  const t = new Date(Date.UTC(y, m - 1 + delta, Math.min(d, last)))
  return t.toISOString().slice(0, 10)
}

/** 로컬 벽시계 분(0~1439) */
export function minuteOfDay(ms: number): number {
  const t = new Date(ms)
  return t.getHours() * 60 + t.getMinutes()
}

/** 분 → 'HH:mm' (24:00 이상은 23:59로) */
export function minutesToTime(min: number): string {
  const m = Math.max(0, Math.min(MINUTES_PER_DAY - 1, Math.round(min)))
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

export const snapMinutes = (min: number, step = SNAP_MIN) => Math.round(min / step) * step

/** 날짜 + 'HH:mm' 에 분을 더한 날짜/시각(자정을 넘으면 다음 날) */
export function addMinutesToTime(date: string, time: string, add: number) {
  const [h, m] = time.split(':').map(Number) as [number, number]
  const total = h * 60 + m + add
  const days = Math.floor(total / MINUTES_PER_DAY)
  return {
    date: addDays(date, days),
    time: minutesToTime(total - days * MINUTES_PER_DAY),
  }
}

/** 저장된 일정에서 입력 형태만 남긴다(id/createdAt 등 제외) */
export function toInput(e: EventInput): EventInput {
  return e.allDay
    ? {
        allDay: true,
        title: e.title,
        color: e.color,
        note: e.note,
        startDate: e.startDate,
        endDate: e.endDate,
      }
    : {
        allDay: false,
        title: e.title,
        color: e.color,
        note: e.note,
        startUtc: e.startUtc,
        endUtc: e.endUtc,
        tzid: e.tzid,
      }
}

/**
 * 일정을 n일 옮긴다(월 보기에서 끌어 놓기). 종일 일정은 날짜만, 시각 일정은 벽시계 시각을 유지하고
 * 실제 길이(ms)를 유지한다. 그래서 DST가 바뀌는 날로 옮겨도 "9시 일정"은 9시에 남는다.
 */
export function shiftEventDays(e: EventInput, days: number): EventInput {
  const base = toInput(e)
  if (days === 0) return base
  if (base.allDay)
    return {
      ...base,
      startDate: addDays(base.startDate, days),
      endDate: addDays(base.endDate, days),
    }
  const startUtc = localDateTime(
    addDays(localDate(base.startUtc), days),
    minutesToTime(minuteOfDay(base.startUtc)),
  )
  return { ...base, startUtc, endUtc: startUtc + (base.endUtc - base.startUtc) }
}

/** 시각 일정을 date의 minute(벽시계)에 시작하도록 옮긴다. 길이(ms)는 유지. */
export function moveTimedEvent(
  e: Extract<EventInput, { allDay: false }>,
  date: string,
  minute: number,
): EventInput {
  const base = toInput(e) as Extract<EventInput, { allDay: false }>
  const startUtc = localDateTime(date, minutesToTime(minute))
  return { ...base, startUtc, endUtc: startUtc + (base.endUtc - base.startUtc) }
}

export interface TimedSlot<E> {
  event: E
  /** 그 날 안에서의 벽시계 분(끝이 다음 날이면 1440) */
  startMin: number
  endMin: number
  /** 겹치는 일정끼리 나눠 쓰는 열 */
  col: number
  cols: number
}

/**
 * 하루 시간 칸 배치. 날짜 경계로 자르고(전날 시작이면 0, 다음 날까지면 1440),
 * 서로 겹치는 일정 묶음마다 빈 열에 차례로 넣는다. 너무 짧은 일정은 minLen분으로 보이게 한다.
 */
export function layoutDay<
  E extends { allDay: false; startUtc: number; endUtc: number; title: string },
>(events: readonly E[], date: string, minLen = SNAP_MIN): TimedSlot<E>[] {
  const dayStart = localDayStart(date)
  const dayEnd = localDayStart(addDays(date, 1))
  const items = events
    .filter((e) => e.startUtc < dayEnd && Math.max(e.endUtc, e.startUtc + 1) > dayStart)
    .map((e) => {
      const startMin = e.startUtc <= dayStart ? 0 : minuteOfDay(e.startUtc)
      const endMin = e.endUtc >= dayEnd ? MINUTES_PER_DAY : minuteOfDay(e.endUtc)
      return {
        event: e,
        startMin,
        endMin: Math.min(MINUTES_PER_DAY, Math.max(endMin, startMin + minLen)),
      }
    })
    .sort(
      (a, b) =>
        a.startMin - b.startMin ||
        b.endMin - a.endMin ||
        a.event.title.localeCompare(b.event.title),
    )

  const out: TimedSlot<E>[] = []
  let group: TimedSlot<E>[] = []
  let colEnds: number[] = []
  let groupEnd = -1
  const flush = () => {
    for (const s of group) s.cols = colEnds.length
    out.push(...group)
    group = []
    colEnds = []
  }
  for (const it of items) {
    if (it.startMin >= groupEnd) flush()
    let col = colEnds.findIndex((end) => end <= it.startMin)
    if (col === -1) col = colEnds.length
    colEnds[col] = it.endMin
    group.push({ ...it, col, cols: 0 })
    groupEnd = Math.max(groupEnd, it.endMin)
  }
  flush()
  return out
}
