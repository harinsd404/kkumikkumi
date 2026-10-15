import { describe, expect, it } from 'vitest'
import { dateParts, monthDay, monthDayKo, weekdayLabel } from '../dateText'

describe('날짜 표기', () => {
  it('풀기와 짧은 표기', () => {
    expect(dateParts('2026-10-05')).toEqual([2026, 10, 5])
    expect(monthDay('2026-01-09')).toBe('1/9')
    expect(monthDayKo('2026-10-13')).toBe('10월 13일')
  })
  it('요일(달력 기준)', () => {
    expect(weekdayLabel('2026-10-11')).toBe('일')
    expect(weekdayLabel('2026-10-13')).toBe('화')
    expect(weekdayLabel('2026-10-17')).toBe('토')
    expect(weekdayLabel('2028-02-29')).toBe('화')
  })
})
