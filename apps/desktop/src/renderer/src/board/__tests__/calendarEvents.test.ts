import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  addDays,
  eventsByDay,
  eventSpan,
  eventToForm,
  formToEvent,
  localDate,
  localDateTime,
  localDayStart,
  rangeForDays,
  timeLabel,
} from '../calendar'

// renderer tsconfig에는 node 타입이 없어 필요한 만큼만 선언한다(테스트는 Node에서 실행)
declare const process: { env: Record<string, string | undefined> }

// 시스템 타임존을 바꿔 가며 검사한다(Node는 실행 중 TZ 변경을 반영한다).
const withTz = (tz: string) => {
  const prev = process.env['TZ']
  beforeAll(() => {
    process.env['TZ'] = tz
  })
  afterAll(() => {
    if (prev === undefined) delete process.env['TZ']
    else process.env['TZ'] = prev
  })
}

const H = 3_600_000
const timed = (title: string, startUtc: number, endUtc: number) =>
  ({ allDay: false, title, startUtc, endUtc }) as const
const allDay = (title: string, startDate: string, endDate: string) =>
  ({ allDay: true, title, startDate, endDate }) as const

describe('Asia/Seoul', () => {
  withTz('Asia/Seoul')
  it('로컬 자정과 날짜', () => {
    expect(localDayStart('2026-10-12')).toBe(Date.UTC(2026, 9, 11, 15)) // KST = UTC+9
    expect(localDate(Date.UTC(2026, 9, 11, 15))).toBe('2026-10-12')
    expect(localDate(Date.UTC(2026, 9, 11, 14, 59))).toBe('2026-10-11')
  })
  it('조회 범위는 마지막 날 다음 자정까지', () => {
    expect(rangeForDays('2026-09-27', '2026-10-31')).toEqual({
      fromUtc: Date.UTC(2026, 8, 26, 15),
      toUtc: Date.UTC(2026, 9, 31, 15),
      fromDate: '2026-09-27',
      toDate: '2026-10-31',
    })
  })
  it('자정을 넘는 일정은 두 날에, 자정에 끝나는 일정은 그날까지만', () => {
    const start = localDateTime('2026-10-12', '23:00')
    expect(eventSpan(timed('a', start, start + 2 * H))).toEqual({
      first: '2026-10-12',
      last: '2026-10-13',
    })
    expect(eventSpan(timed('b', start, localDayStart('2026-10-13')))).toEqual({
      first: '2026-10-12',
      last: '2026-10-12',
    })
    expect(eventSpan(timed('zero', start, start))).toEqual({
      first: '2026-10-12',
      last: '2026-10-12',
    })
  })
  it('날짜별 묶기: 종일 먼저, 시작 시각 순, 범위 밖 날짜는 자름', () => {
    const days = ['2026-10-12', '2026-10-13', '2026-10-14']
    const m = eventsByDay(
      [
        timed('저녁', localDateTime('2026-10-12', '19:00'), localDateTime('2026-10-12', '20:00')),
        timed('아침', localDateTime('2026-10-12', '08:00'), localDateTime('2026-10-12', '09:00')),
        allDay('여행', '2026-10-01', '2026-10-13'), // 포함 끝
        allDay('먼 미래', '2026-12-01', '2026-12-01'),
      ],
      days,
    )
    expect(m.get('2026-10-12')!.map((e) => e.title)).toEqual(['여행', '아침', '저녁'])
    expect(m.get('2026-10-13')!.map((e) => e.title)).toEqual(['여행'])
    expect(m.get('2026-10-14')).toEqual([])
  })
  it('폼 → 일정 → 폼 왕복', () => {
    const r = formToEvent(
      {
        title: '  회의 ',
        allDay: false,
        startDate: '2026-10-12',
        endDate: '2026-10-12',
        startTime: '14:00',
        endTime: '15:30',
        color: '#d9b48a',
        note: '',
      },
      'Asia/Seoul',
    )
    expect(r.ok && r.event).toMatchObject({
      title: '회의',
      allDay: false,
      startUtc: Date.UTC(2026, 9, 12, 5),
      endUtc: Date.UTC(2026, 9, 12, 6, 30),
      tzid: 'Asia/Seoul',
    })
    if (r.ok) expect(eventToForm(r.event)).toMatchObject({ startTime: '14:00', endTime: '15:30' })
  })
  it('폼 검증', () => {
    const f = {
      title: 'x',
      allDay: true,
      startDate: '2026-10-12',
      endDate: '2026-10-11',
      startTime: '09:00',
      endTime: '10:00',
      color: '#000000',
      note: '',
    }
    expect(formToEvent(f, 'Asia/Seoul').ok).toBe(false) // 끝 < 시작
    expect(formToEvent({ ...f, endDate: '2026-10-12' }, 'Asia/Seoul').ok).toBe(true)
    expect(formToEvent({ ...f, title: '   ' }, 'Asia/Seoul').ok).toBe(false)
    expect(
      formToEvent({ ...f, allDay: false, endDate: '2026-10-12', endTime: '08:00' }, 'Asia/Seoul')
        .ok,
    ).toBe(false)
    expect(
      formToEvent({ ...f, allDay: false, endDate: '2026-10-12', endTime: '25:00' }, 'Asia/Seoul')
        .ok,
    ).toBe(false)
  })
})

describe('America/New_York (DST)', () => {
  withTz('America/New_York')
  it('DST 시작일(2026-03-08)은 23시간, 종료일(2026-11-01)은 25시간', () => {
    expect(localDayStart('2026-03-09') - localDayStart('2026-03-08')).toBe(23 * H)
    expect(localDayStart('2026-11-02') - localDayStart('2026-11-01')).toBe(25 * H)
    expect(addDays('2026-03-08', 1)).toBe('2026-03-09')
  })
  it('DST 날의 일정도 그날 하루에만 놓인다', () => {
    const s = localDateTime('2026-11-01', '00:30')
    const e = localDateTime('2026-11-01', '23:30')
    expect(e - s).toBe(24 * H) // 25시간인 날
    expect(eventSpan(timed('긴 하루', s, e))).toEqual({ first: '2026-11-01', last: '2026-11-01' })
  })
  it('없는 시각(02:30, 봄)은 앞으로 밀린다', () => {
    expect(timeLabel(localDateTime('2026-03-08', '02:30'))).toBe('03:30')
  })
  it('서울에서 만든 일정을 뉴욕에서 보면 로컬 시각으로 보인다', () => {
    const startUtc = Date.UTC(2026, 9, 12, 5) // 서울 14:00
    expect(localDate(startUtc)).toBe('2026-10-12')
    expect(timeLabel(startUtc)).toBe('01:00') // EDT = UTC-4
  })
})
