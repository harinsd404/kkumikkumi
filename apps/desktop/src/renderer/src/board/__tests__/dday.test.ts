import type { CalendarEvent } from '@kkumikkumi/schema'
import { describe, expect, it } from 'vitest'
import { daysBetween, ddayDateLabel, ddayOf, sortUpcoming } from '../dday'

const base = { color: '#ff0000', note: '', recurrence: null, createdAt: 0, updatedAt: 0 }
const allDay = (
  id: string,
  title: string,
  startDate: string,
  endDate = startDate,
): CalendarEvent => ({
  ...base,
  id,
  title,
  allDay: true,
  startDate,
  endDate,
})
const timed = (id: string, title: string, start: Date, end: Date): CalendarEvent => ({
  ...base,
  id,
  title,
  allDay: false,
  startUtc: start.getTime(),
  endUtc: end.getTime(),
  tzid: 'Asia/Seoul',
})

describe('daysBetween', () => {
  it('달·해를 넘어도 달력 날짜 차이', () => {
    expect(daysBetween('2026-10-15', '2026-10-16')).toBe(1)
    expect(daysBetween('2026-12-31', '2027-01-01')).toBe(1)
    expect(daysBetween('2028-02-28', '2028-03-01')).toBe(2) // 윤년
    expect(daysBetween('2026-10-16', '2026-10-15')).toBe(-1)
  })
  it('서머타임 전환일도 하루는 하루', () => {
    expect(daysBetween('2026-03-07', '2026-03-09')).toBe(2)
    expect(daysBetween('2026-10-24', '2026-10-26')).toBe(2)
  })
})

describe('ddayOf', () => {
  const today = '2026-10-15'
  it('남은 날 D-N, 오늘 D-DAY, 지난 일정은 시작일부터 D+N', () => {
    expect(ddayOf(allDay('a', '시험', '2026-10-27'), today)).toEqual({
      diff: 12,
      label: 'D-12',
      ongoing: false,
    })
    expect(ddayOf(allDay('a', '오늘', today), today).label).toBe('D-DAY')
    expect(ddayOf(allDay('a', '내일', '2026-10-16'), today).label).toBe('D-1')
    expect(ddayOf(allDay('a', '기념일', '2026-07-07'), today)).toEqual({
      diff: -100,
      label: 'D+100',
      ongoing: false,
    })
  })
  it('여러 날 일정은 진행 중이면 D-DAY(ongoing), 끝나면 시작일 기준 D+N', () => {
    const trip = allDay('a', '여행', '2026-10-14', '2026-10-16')
    expect(ddayOf(trip, today)).toEqual({ diff: 0, label: 'D-DAY', ongoing: true })
    expect(ddayOf(trip, '2026-10-17').label).toBe('D+3')
  })
  it('시각 일정: 로컬 날짜, 자정에 끝나면 전날까지', () => {
    const e = timed('a', '회의', new Date(2026, 9, 16, 23, 0), new Date(2026, 9, 17, 0, 0))
    expect(ddayOf(e, today).label).toBe('D-1')
    expect(ddayOf(e, '2026-10-16').label).toBe('D-DAY')
    expect(ddayOf(e, '2026-10-17').label).toBe('D+1')
  })
})

describe('sortUpcoming', () => {
  it('시작 날짜 → 종일 먼저 → 시작 시각 → 제목', () => {
    const list = [
      timed('t2', '오후', new Date(2026, 9, 20, 15), new Date(2026, 9, 20, 16)),
      allDay('a2', '나', '2026-10-20'),
      timed('t1', '오전', new Date(2026, 9, 20, 9), new Date(2026, 9, 20, 10)),
      allDay('a1', '가', '2026-10-20'),
      allDay('a0', '먼저', '2026-10-18', '2026-10-25'),
    ]
    expect(sortUpcoming(list).map((e) => e.id)).toEqual(['a0', 'a1', 'a2', 't1', 't2'])
  })
})

describe('ddayDateLabel', () => {
  it('하루 / 여러 날', () => {
    expect(ddayDateLabel(allDay('a', 'x', '2026-12-01'))).toBe('12월 1일 (화)')
    expect(ddayDateLabel(allDay('a', 'x', '2026-12-01', '2026-12-03'))).toBe(
      '12월 1일 (화) ~ 12월 3일 (목)',
    )
  })
})
