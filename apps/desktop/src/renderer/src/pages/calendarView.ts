import {
  addDays,
  localDate,
  localDateTime,
  localDayStart,
  monthGrid,
  weekOf,
  type EventInput,
} from '../board/calendar'
import { daysBetween } from '../board/dday'
import { fromMin } from '../board/timetable'
import { dateParts, monthDayKo, weekdayLabel } from './dateText'

// 캘린더 세부 페이지의 날짜 이동, 일정 옮기기, 시간 칸 배치(순수 함수).
// 시각은 모두 "지금 시스템 타임존의 벽시계" 기준이다. DST가 바뀌는 날은 하루가 23/25시간이 될 수 있다.

export type CalView = 'month' | 'week' | 'day'
export const MINUTES_PER_DAY = 24 * 60
export const SNAP_MIN = 15

/** a → b 사이의 날짜 수(달력 기준, DST 무관) */
export const dayDiff = daysBetween

/** 페이지 제목: "2026년 10월" / "10월 13일 (화)" / "10월 12일 – 18일" */
export function titleFor(view: CalView, anchor: string, days: readonly string[]): string {
  const [y, m] = dateParts(anchor)
  if (view === 'month') return `${y}년 ${m}월`
  if (view === 'day') return `${monthDayKo(anchor)} (${weekdayLabel(anchor)})`
  const first = days[0]!
  const last = days[days.length - 1]!
  return dateParts(first)[1] === dateParts(last)[1]
    ? `${monthDayKo(first)} – ${dateParts(last)[2]}일`
    : `${monthDayKo(first)} – ${monthDayKo(last)}`
}

/** 보기에 나오는 날짜들(월 보기는 앞뒤 달을 포함한 4~6주) */
export function visibleDays(view: CalView, anchor: string, weekStartsOn: 0 | 1): string[] {
  const [y, m, d] = dateParts(anchor)
  if (view === 'day') return [anchor]
  if (view === 'week') return weekOf(y, m - 1, d, weekStartsOn).map((c) => c.date)
  return monthGrid(y, m - 1, weekStartsOn)
    .flat()
    .map((c) => c.date)
}

/** 같은 날 몇 일 뒤/앞(월말은 그 달 마지막 날로 맞춤) */
export function shiftAnchor(date: string, view: CalView, delta: number): string {
  if (view === 'day') return addDays(date, delta)
  if (view === 'week') return addDays(date, delta * 7)
  const [y, m, d] = dateParts(date)
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
export const minutesToTime = fromMin

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
function toInput(e: EventInput): EventInput {
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
  // 하루 밖의 분(음수 = 전날, 1440 이상 = 다음 날)은 날짜를 넘겨 맞춘다
  const days = Math.floor(minute / MINUTES_PER_DAY)
  const startUtc = localDateTime(
    addDays(date, days),
    minutesToTime(minute - days * MINUTES_PER_DAY),
  )
  return { ...base, startUtc, endUtc: startUtc + (base.endUtc - base.startUtc) }
}

/** 끌어서 놓을 자리: 날짜 칸(월 보기, 종일 줄) / 시간 칸의 분(전날로 넘어가면 음수) */
export type DropTarget =
  { kind: 'day'; date: string } | { kind: 'time'; date: string; minute: number }

/**
 * 놓은 자리에 맞춘 새 일정. 바뀌지 않으면 null.
 * originDate: 끌기 시작한 칸의 날짜(여러 날 일정은 잡은 칸 기준으로 옮긴다)
 */
export function dropResult(d: {
  event: EventInput
  originDate: string
  target: DropTarget | null
}): EventInput | null {
  const t = d.target
  if (!t) return null
  if (t.kind === 'day') {
    const n = dayDiff(d.originDate, t.date)
    return n === 0 ? null : shiftEventDays(d.event, n)
  }
  if (d.event.allDay) return null // 종일 일정은 시간 칸에 놓지 않는다
  const next = moveTimedEvent(d.event, t.date, t.minute)
  return !next.allDay && next.startUtc === d.event.startUtc ? null : next
}

interface TimedSlot<E> {
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
