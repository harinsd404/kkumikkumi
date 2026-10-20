import { describe, expect, it } from 'vitest'
import { dayProgress, daysLabel, habitStreak, isScheduled, toggleDay } from '../habits'

const set = (...dates: string[]) => {
  const s = new Set(dates)
  return (d: string) => s.has(d)
}
// 2026-10-21 = 수요일
const WEEKDAYS = 0b0111110

describe('습관', () => {
  it('요일 판정과 표시', () => {
    expect(isScheduled(WEEKDAYS, '2026-10-21')).toBe(true)
    expect(isScheduled(WEEKDAYS, '2026-10-24')).toBe(false) // 토
    expect(daysLabel(127)).toBe('매일')
    expect(daysLabel(WEEKDAYS)).toBe('평일')
    expect(daysLabel(toggleDay(0, 1) | toggleDay(0, 3) | toggleDay(0, 5))).toBe('월·수·금')
  })
  it('연속 기록: 오늘 아직이면 어제부터, 끊기면 멈춘다', () => {
    expect(habitStreak(127, set('2026-10-19', '2026-10-20'), '2026-10-21')).toBe(2)
    expect(habitStreak(127, set('2026-10-19', '2026-10-20', '2026-10-21'), '2026-10-21')).toBe(3)
    expect(habitStreak(127, set('2026-10-18', '2026-10-20'), '2026-10-21')).toBe(1)
  })
  it('하지 않는 요일(주말)은 건너뛰고 이어진다', () => {
    // 금(16) 체크, 토·일 쉼, 월(19)·화(20) 체크, 수(21) 아직
    expect(habitStreak(WEEKDAYS, set('2026-10-16', '2026-10-19', '2026-10-20'), '2026-10-21')).toBe(
      3,
    )
    // 오늘이 토요일(하지 않는 날)이면 금요일부터
    expect(habitStreak(WEEKDAYS, set('2026-10-23'), '2026-10-24')).toBe(1)
  })
  it('그날 해야 하는 습관만 센다', () => {
    const habits = [
      { id: 'a', days: 127 },
      { id: 'b', days: WEEKDAYS },
    ]
    const checked = (id: string, d: string) => id === 'a' && d === '2026-10-24'
    expect(dayProgress(habits, checked, '2026-10-24')).toEqual({ done: 1, total: 1 })
    expect(dayProgress(habits, checked, '2026-10-21')).toEqual({ done: 0, total: 2 })
  })
})
