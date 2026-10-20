import { describe, expect, it } from 'vitest'
import { percent, periodProgress, periodRange } from '../progress'

const at = (y: number, m: number, d: number, h = 0) => new Date(y, m - 1, d, h)

describe('진행률 기간', () => {
  it('이번 주: 주 시작 요일(월/일)에 맞춘 7일', () => {
    const now = at(2026, 10, 21, 12) // 수요일
    expect(periodRange({ kind: 'week' }, now, 1).start).toEqual(at(2026, 10, 19))
    expect(periodRange({ kind: 'week' }, now, 0).start).toEqual(at(2026, 10, 18))
    expect(periodRange({ kind: 'week' }, at(2026, 10, 18), 1).start).toEqual(at(2026, 10, 12)) // 일요일은 지난주 끝
  })
  it('오늘 정오는 50%, 남은 시간', () => {
    const r = periodProgress({ kind: 'day' }, at(2026, 10, 20, 12), 1)
    expect(percent(r.ratio)).toBe(50)
    expect(r.detail).toBe('12시간 남음')
  })
  it('이번 달·올해 이름과 남은 날(오늘 제외, 끝 날 포함)', () => {
    const r = periodProgress({ kind: 'month' }, at(2026, 10, 20, 9), 1)
    expect(r.label).toBe('10월')
    expect(r.detail).toBe('11일 남음')
    expect(periodProgress({ kind: 'month' }, at(2026, 10, 31, 9), 1).detail).toBe(
      '오늘이 마지막 날',
    )
    expect(periodProgress({ kind: 'year' }, at(2026, 1, 1), 1)).toMatchObject({
      label: '2026년',
      ratio: 0,
    })
  })
  it('직접 지정: 끝 날 포함, 시작 전 D-N, 끝나면 100%', () => {
    const p = { kind: 'custom' as const, label: '2학기', start: '2026-09-01', end: '2026-12-31' }
    expect(periodProgress(p, at(2026, 8, 28), 1)).toMatchObject({
      ratio: 0,
      detail: '시작 전 · D-4',
    })
    expect(periodProgress(p, at(2027, 1, 1), 1)).toMatchObject({ ratio: 1, detail: '끝남' })
    const mid = periodProgress(p, at(2026, 12, 31, 23), 1)
    expect(mid.detail).toBe('오늘이 마지막 날')
    expect(percent(mid.ratio)).toBe(99)
  })
  it('서머타임이 있는 달에도 0~1 안', () => {
    const r = periodProgress({ kind: 'month' }, at(2026, 3, 8, 12), 0)
    expect(r.ratio).toBeGreaterThan(0)
    expect(r.ratio).toBeLessThan(1)
  })
})
