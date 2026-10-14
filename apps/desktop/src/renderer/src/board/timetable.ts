import type { TimetableEntry, TimetableSettings } from '@kkumikkumi/schema'

// 시간표 계산(순수 함수). 요일은 0=월 … 6=일, 시각은 "HH:MM" 또는 그 날 0시부터의 분.

export const DAY_LABEL = ['월', '화', '수', '목', '금', '토', '일'] as const

/** Date → 0=월 … 6=일 */
export const weekdayOf = (d: Date): number => (d.getDay() + 6) % 7

export const minuteOfDay = (d: Date): number => d.getHours() * 60 + d.getMinutes()

export const toMin = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number)
  return h! * 60 + m!
}
export const fromMin = (min: number): string => {
  const m = Math.max(0, Math.min(23 * 60 + 59, Math.round(min)))
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

/** 보이는 요일: 월~금 + 설정한 토/일 */
export const visibleDays = (s: Pick<TimetableSettings, 'showSat' | 'showSun'>): number[] => [
  0,
  1,
  2,
  3,
  4,
  ...(s.showSat ? [5] : []),
  ...(s.showSun ? [6] : []),
]

/** 지금 몇 교시인지(0부터). 쉬는 시간/수업 밖이면 null */
export function currentPeriod(
  periods: TimetableSettings['periods'],
  minute: number,
): number | null {
  const i = periods.findIndex((p) => toMin(p.start) <= minute && minute < toMin(p.end))
  return i === -1 ? null : i
}

/** 교시 하나 더: 마지막 교시 10분 뒤부터 50분. 자정을 넘기면 null */
export function nextPeriodTime(
  periods: TimetableSettings['periods'],
): { start: string; end: string } | null {
  const last = periods.at(-1)
  const start = last ? toMin(last.end) + 10 : 9 * 60
  const end = start + 50
  return end <= 23 * 60 + 59 ? { start: fromMin(start), end: fromMin(end) } : null
}

/** 보드/목록에 보여 줄 한 항목: 시각은 교시 설정이나 항목에서 */
export interface TimetableItem {
  entry: TimetableEntry
  /** 교시 방식이면 교시 번호(1부터) */
  period: number | null
  start: string
  end: string
}

/** 그 요일의 항목(현재 방식만), 시작 순 */
export function dayItems(
  entries: readonly TimetableEntry[],
  s: TimetableSettings,
  day: number,
): TimetableItem[] {
  const out: TimetableItem[] = []
  for (const e of entries) {
    if (e.slot.day !== day || e.slot.kind !== s.mode) continue
    if (e.slot.kind === 'period') {
      const p = s.periods[e.slot.period - 1]
      if (p) out.push({ entry: e, period: e.slot.period, start: p.start, end: p.end })
    } else out.push({ entry: e, period: null, start: e.slot.start, end: e.slot.end })
  }
  return out.sort(
    (a, b) =>
      toMin(a.start) - toMin(b.start) ||
      toMin(a.end) - toMin(b.end) ||
      a.entry.subject.localeCompare(b.entry.subject),
  )
}

export const isNow = (i: { start: string; end: string }, minute: number) =>
  toMin(i.start) <= minute && minute < toMin(i.end)

/** 교시 칸 찾기 */
export const cellEntry = (
  entries: readonly TimetableEntry[],
  day: number,
  period: number,
): TimetableEntry | undefined =>
  entries.find((e) => e.slot.kind === 'period' && e.slot.day === day && e.slot.period === period)

/** 과목 색 후보(밝은 파스텔, 어두운 글자와 함께 쓴다). 서로 잘 구분되는 순서로 둔다. */
export const SUBJECT_COLORS = [
  '#ffd6a5',
  '#a0c4ff',
  '#caffbf',
  '#ffadad',
  '#bdb2ff',
  '#fdffb6',
  '#9bf6ff',
  '#ffc6ff',
  '#f1e3c6',
  '#b8e0d2',
  '#eac4d5',
  '#d8e2dc',
] as const

const subjectKey = (s: string) => s.trim()

/**
 * 자동 색: 과목을 처음 입력한 순서(가장 이른 createdAt)대로 색을 하나씩 준다.
 * 과목이 12개 이하면 서로 겹치지 않고, 새 과목을 더해도 기존 과목 색은 그대로다.
 */
export function autoColors(
  entries: readonly { subject: string; createdAt: number }[],
): Map<string, string> {
  const first = new Map<string, number>()
  for (const e of entries) {
    const k = subjectKey(e.subject)
    const t = first.get(k)
    if (t === undefined || e.createdAt < t) first.set(k, e.createdAt)
  }
  const order = [...first].sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))
  return new Map(order.map(([k], i) => [k, SUBJECT_COLORS[i % SUBJECT_COLORS.length]!]))
}

/** 직접 고른 색, 없으면 자동 색. 아직 없는 과목은 다음 차례 색. */
export function entryColor(
  e: { subject: string; color: string | null },
  auto: ReadonlyMap<string, string>,
): string {
  if (e.color) return e.color
  return auto.get(subjectKey(e.subject)) ?? SUBJECT_COLORS[auto.size % SUBJECT_COLORS.length]!
}

export interface Placed<T> {
  item: T
  startMin: number
  endMin: number
  /** 겹치는 항목끼리 나눠 쓰는 열 */
  col: number
  cols: number
}

/** 시간 방식 하루 배치: 겹치는 묶음마다 빈 열에 차례로 넣는다 */
export function layoutColumns<T extends { start: string; end: string }>(
  items: readonly T[],
): Placed<T>[] {
  const sorted = items
    .map((item) => ({ item, startMin: toMin(item.start), endMin: toMin(item.end) }))
    .sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin)
  const out: Placed<T>[] = []
  let group: Placed<T>[] = []
  let colEnds: number[] = []
  let groupEnd = -1
  const flush = () => {
    for (const g of group) g.cols = colEnds.length
    out.push(...group)
    group = []
    colEnds = []
  }
  for (const it of sorted) {
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

/** 시간 방식 화면의 세로 범위(시): 기본 8~18시, 항목이 밖에 있으면 넓힌다 */
export function hourRange(items: readonly { start: string; end: string }[]): [number, number] {
  let from = 8
  let to = 18
  for (const i of items) {
    from = Math.min(from, Math.floor(toMin(i.start) / 60))
    to = Math.max(to, Math.ceil(toMin(i.end) / 60))
  }
  return [from, Math.min(24, to)]
}
