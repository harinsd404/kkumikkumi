import type { Timetable, TimetableEntry, TimetableSettings } from '@kkumikkumi/schema'

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
/* ───────── 색: 테마 색(강조·체크)의 톤 ───────── */

const TONE_COUNT = 12
/** 톤 k의 밝기(HSL L). 글자(테마 글자색)가 잘 보이도록 옅은 쪽에서만 고른다. */
const TONE_LIGHTNESS = [0.87, 0.79, 0.91, 0.73, 0.83, 0.67] as const
const MAX_SATURATION = 0.75

const hexToHsl = (hex: string): [number, number, number] => {
  const n = parseInt(hex.slice(1, 7), 16)
  const r = ((n >> 16) & 255) / 255
  const g = ((n >> 8) & 255) / 255
  const b = (n & 255) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const d = max - min
  if (d === 0) return [0, 0, l]
  const s = d / (1 - Math.abs(2 * l - 1))
  const h =
    max === r
      ? ((g - b) / d + (g < b ? 6 : 0)) * 60
      : max === g
        ? ((b - r) / d + 2) * 60
        : ((r - g) / d + 4) * 60
  return [h, s, l]
}

const hslToHex = (h: number, s: number, l: number): string => {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  const [r, g, b] =
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x]
  const hex = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, '0')
  return `#${hex(r)}${hex(g)}${hex(b)}`
}

/**
 * 테마의 강조색·체크색에서 만든 톤 12개. i번 톤 = (i % 2 == 0 ? 강조 : 체크)의 (i / 2)번째 밝기.
 * 번호가 섞여 있어 자동 색은 두 색을 번갈아 쓰고, 고르는 화면은 색마다 한 줄로 묶어 보여 준다.
 * 테마가 바뀌면 같은 번호가 새 테마의 톤이 된다.
 */
export function themeTones(palette: { accent: string; check: string }): string[] {
  const bases = [hexToHsl(palette.accent), hexToHsl(palette.check)]
  return Array.from({ length: TONE_COUNT }, (_, i) => {
    const [h, s] = bases[i % 2]!
    return hslToHex(h, Math.min(s, MAX_SATURATION), TONE_LIGHTNESS[Math.floor(i / 2)]!)
  })
}

/** 고르는 화면의 줄: [강조색 톤 번호들, 체크색 톤 번호들], 각각 옅은 → 진한 순 */
export const TONE_ROWS: readonly (readonly number[])[] = [0, 1].map((base) =>
  TONE_LIGHTNESS.map((_, k) => k)
    .sort((a, b) => TONE_LIGHTNESS[b]! - TONE_LIGHTNESS[a]!)
    .map((k) => k * 2 + base),
)

const subjectKey = (s: string) => s.trim()

/**
 * 자동 색: 과목을 처음 입력한 순서(가장 이른 createdAt)대로 톤 번호를 하나씩 준다.
 * 과목이 12개 이하면 서로 겹치지 않고, 새 과목을 더해도 기존 과목 색은 그대로다.
 */
export function autoColors(
  entries: readonly { subject: string; createdAt: number }[],
): Map<string, number> {
  const first = new Map<string, number>()
  for (const e of entries) {
    const k = subjectKey(e.subject)
    const t = first.get(k)
    if (t === undefined || e.createdAt < t) first.set(k, e.createdAt)
  }
  const order = [...first].sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))
  return new Map(order.map(([k], i) => [k, i % TONE_COUNT]))
}

/** 직접 고른 톤, 없으면 자동 톤. 아직 없는 과목은 다음 차례 톤. → 실제 색 */
export function entryColor(
  e: { subject: string; tone: number | null },
  auto: ReadonlyMap<string, number>,
  tones: readonly string[],
): string {
  const i = e.tone ?? auto.get(subjectKey(e.subject)) ?? auto.size % TONE_COUNT
  return tones[i % tones.length]!
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

/* ───────── 여러 시간표 ───────── */

export interface TimetableView {
  timetable: Timetable
  settings: TimetableSettings
  /** 이 시간표의 칸/항목만 */
  entries: TimetableEntry[]
}

/**
 * 보여 줄 시간표: id가 있고 아직 있으면 그것, 아니면 고른 시간표(activeId), 그것도 없으면 첫 시간표.
 * 시간표가 하나도 없으면 null.
 */
export function pickTimetable(
  data: {
    timetables: readonly Timetable[]
    activeId: string | null
    entries: readonly TimetableEntry[]
  },
  id: string | null = null,
): TimetableView | null {
  const t =
    data.timetables.find((x) => x.id === id) ??
    data.timetables.find((x) => x.id === data.activeId) ??
    data.timetables[0]
  if (!t) return null
  return {
    timetable: t,
    settings: t.settings,
    entries: data.entries.filter((e) => e.timetableId === t.id),
  }
}

/** 겹치지 않는 이름: base, base 2, base 3 … (30자 안으로) */
export function uniqueName(names: readonly string[], base: string): string {
  const taken = new Set(names)
  const b = base.slice(0, 30)
  if (!taken.has(b)) return b
  for (let n = 2; ; n++) {
    const suffix = ` ${n}`
    const name = b.slice(0, 30 - suffix.length) + suffix
    if (!taken.has(name)) return name
  }
}
