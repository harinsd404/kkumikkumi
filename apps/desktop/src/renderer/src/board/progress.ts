import type { ProgressPeriod } from '@kkumikkumi/schema'
import { parseDate } from './calendar'

// 진행률 블록(순수 함수): 기간이 얼마나 지났는지. 기간은 로컬 시각 기준 [시작 0시, 끝 다음 날 0시).

export interface PeriodProgress {
  label: string
  /** 0~1 */
  ratio: number
  /** "3일 남음", "5시간 남음", "시작 전 · D-4", "끝남" */
  detail: string
}

const DAY = 86_400_000

/** 기간의 시작·끝(끝은 포함하지 않는 다음 경계)과 이름 */
export function periodRange(
  p: ProgressPeriod,
  now: Date,
  weekStartsOn: 0 | 1,
): { start: Date; end: Date; label: string } {
  const y = now.getFullYear()
  const m = now.getMonth()
  const d = now.getDate()
  switch (p.kind) {
    case 'day':
      return { start: new Date(y, m, d), end: new Date(y, m, d + 1), label: '오늘' }
    case 'week': {
      const back = (now.getDay() - weekStartsOn + 7) % 7
      return {
        start: new Date(y, m, d - back),
        end: new Date(y, m, d - back + 7),
        label: '이번 주',
      }
    }
    case 'month':
      return { start: new Date(y, m, 1), end: new Date(y, m + 1, 1), label: `${m + 1}월` }
    case 'year':
      return { start: new Date(y, 0, 1), end: new Date(y + 1, 0, 1), label: `${y}년` }
    case 'custom': {
      const s = parseDate(p.start)
      const e = parseDate(p.end)
      return {
        start: new Date(s.y, s.m0, s.d),
        end: new Date(e.y, e.m0, e.d + 1),
        label: p.label,
      }
    }
  }
}

/** 남은 달력 날짜 수(오늘을 빼고, 끝 날 포함) */
const daysLeft = (now: Date, end: Date) => {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.round((end.getTime() - today.getTime()) / DAY) - 1
}

export function periodProgress(p: ProgressPeriod, now: Date, weekStartsOn: 0 | 1): PeriodProgress {
  const { start, end, label } = periodRange(p, now, weekStartsOn)
  const t = now.getTime()
  if (t < start.getTime()) {
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const until = Math.round((start.getTime() - today.getTime()) / DAY)
    return { label, ratio: 0, detail: `시작 전 · D-${until}` }
  }
  if (t >= end.getTime()) return { label, ratio: 1, detail: '끝남' }
  const ratio = (t - start.getTime()) / (end.getTime() - start.getTime())
  if (p.kind === 'day') {
    const h = Math.ceil((end.getTime() - t) / 3_600_000)
    return { label, ratio, detail: `${h}시간 남음` }
  }
  const left = daysLeft(now, end)
  return { label, ratio, detail: left === 0 ? '오늘이 마지막 날' : `${left}일 남음` }
}

/** 퍼센트 표시(내림, 0~100) */
export const percent = (ratio: number) => Math.floor(Math.min(1, Math.max(0, ratio)) * 100)
