import { DEFAULT_TIMETABLE, type TimetableEntry } from '@kkumikkumi/schema'
import { describe, expect, it } from 'vitest'
import {
  cellEntry,
  currentPeriod,
  dayItems,
  autoColors,
  entryColor,
  fromMin,
  hourRange,
  isNow,
  layoutColumns,
  nextPeriodTime,
  SUBJECT_COLORS,
  toMin,
  visibleDays,
  weekdayOf,
} from '../timetable'

const U = (n: number) => `00000000-0000-7000-8000-${String(n).padStart(12, '0')}`
const e = (n: number, slot: TimetableEntry['slot'], subject = `과목${n}`): TimetableEntry => ({
  id: U(n),
  slot,
  subject,
  room: '',
  color: null,
  createdAt: 0,
  updatedAt: 0,
})
const S = DEFAULT_TIMETABLE

describe('요일/시각', () => {
  it('월요일 0, 일요일 6', () => {
    expect(weekdayOf(new Date(2026, 9, 12))).toBe(0) // 월
    expect(weekdayOf(new Date(2026, 9, 18))).toBe(6) // 일
  })
  it('분 변환', () => {
    expect(toMin('08:40')).toBe(520)
    expect(fromMin(520)).toBe('08:40')
    expect(fromMin(24 * 60 + 5)).toBe('23:59')
  })
  it('보이는 요일', () => {
    expect(visibleDays({ showSat: false, showSun: false })).toEqual([0, 1, 2, 3, 4])
    expect(visibleDays({ showSat: false, showSun: true })).toEqual([0, 1, 2, 3, 4, 6])
  })
})

describe('교시', () => {
  it('지금 교시: 수업 중이면 번호, 쉬는 시간/밖이면 null, 끝 시각은 포함하지 않음', () => {
    expect(currentPeriod(S.periods, toMin('08:40'))).toBe(0)
    expect(currentPeriod(S.periods, toMin('09:29'))).toBe(0)
    expect(currentPeriod(S.periods, toMin('09:30'))).toBeNull()
    expect(currentPeriod(S.periods, toMin('13:45'))).toBe(4)
    expect(currentPeriod(S.periods, toMin('07:00'))).toBeNull()
  })
  it('교시 추가 시각, 자정을 넘기면 null', () => {
    expect(nextPeriodTime(S.periods)).toEqual({ start: '17:30', end: '18:20' })
    expect(nextPeriodTime([{ start: '22:00', end: '23:20' }])).toBeNull()
    expect(nextPeriodTime([])).toEqual({ start: '09:00', end: '09:50' })
  })
})

describe('dayItems', () => {
  const entries = [
    e(1, { kind: 'period', day: 0, period: 3 }),
    e(2, { kind: 'period', day: 0, period: 1 }),
    e(3, { kind: 'period', day: 1, period: 1 }),
    e(4, { kind: 'time', day: 0, start: '10:00', end: '11:00' }),
    e(5, { kind: 'period', day: 0, period: 12 }), // 설정에 없는 교시
  ]
  it('현재 방식의 그 요일 항목만, 교시 시각을 붙여 시작 순', () => {
    expect(dayItems(entries, S, 0).map((i) => [i.entry.id, i.period, i.start])).toEqual([
      [U(2), 1, '08:40'],
      [U(1), 3, '10:40'],
    ])
    expect(dayItems(entries, { ...S, mode: 'time' }, 0).map((i) => i.entry.id)).toEqual([U(4)])
  })
  it('지금 수업 판정과 칸 찾기', () => {
    expect(isNow({ start: '10:00', end: '11:00' }, 600)).toBe(true)
    expect(isNow({ start: '10:00', end: '11:00' }, 660)).toBe(false)
    expect(cellEntry(entries, 1, 1)?.id).toBe(U(3))
    expect(cellEntry(entries, 1, 2)).toBeUndefined()
  })
})

describe('색/배치', () => {
  it('자동 색: 처음 입력한 순서대로 서로 다른 색, 직접 고른 색 우선', () => {
    const list = ['국어', '수학', '영어', '과학', '체육', '음악', '미술', '사회'].map((sub, i) => ({
      ...e(i + 1, { kind: 'period', day: 0, period: 1 }, sub),
      createdAt: i,
    }))
    const auto = autoColors([...list, { ...list[1]!, createdAt: 99 }]) // 같은 과목 다시
    expect(auto.size).toBe(8)
    expect(new Set(list.map((x) => entryColor(x, auto))).size).toBe(8)
    expect(entryColor({ subject: ' 수학 ', color: null }, auto)).toBe(SUBJECT_COLORS[1])
    expect(entryColor({ subject: '수학', color: '#123456' }, auto)).toBe('#123456')
    // 새 과목은 다음 차례 색, 기존 색은 그대로
    expect(entryColor({ subject: '정보', color: null }, auto)).toBe(SUBJECT_COLORS[8])
  })
  it('겹치는 항목은 나란히, 이어지는 항목은 한 열', () => {
    const r = layoutColumns([
      { id: 'a', start: '09:00', end: '10:00' },
      { id: 'b', start: '09:30', end: '10:30' },
      { id: 'c', start: '10:30', end: '11:00' },
    ])
    expect(r.map((p) => [p.item.id, p.col, p.cols])).toEqual([
      ['a', 0, 2],
      ['b', 1, 2],
      ['c', 0, 1],
    ])
  })
  it('세로 범위: 기본 8~18시, 밖의 항목이 있으면 넓힘', () => {
    expect(hourRange([])).toEqual([8, 18])
    expect(hourRange([{ start: '07:30', end: '20:10' }])).toEqual([7, 21])
  })
})
