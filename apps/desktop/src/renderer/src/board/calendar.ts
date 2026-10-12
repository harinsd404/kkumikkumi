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
