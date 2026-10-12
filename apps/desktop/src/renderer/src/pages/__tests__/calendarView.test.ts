import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { localDateTime, timeLabel, localDate, type EventInput } from '../../board/calendar'
import {
  addMinutesToTime,
  dayDiff,
  layoutDay,
  minutesToTime,
  moveTimedEvent,
  shiftAnchor,
  shiftEventDays,
  snapMinutes,
} from '../calendarView'

declare const process: { env: Record<string, string | undefined> }
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
const base = { title: 'a', color: '#ff0000', note: '' }
const timed = (date: string, start: string, end: string, title = 'a') =>
  ({
    ...base,
    title,
    allDay: false,
    startUtc: localDateTime(date, start),
    endUtc: localDateTime(date, end),
    tzid: 'X',
  }) as const

describe('날짜 이동', () => {
  it('dayDiff / shiftAnchor (월말 보정)', () => {
    expect(dayDiff('2026-10-12', '2026-10-15')).toBe(3)
    expect(dayDiff('2026-10-15', '2026-09-30')).toBe(-15)
    expect(shiftAnchor('2026-01-31', 'month', 1)).toBe('2026-02-28')
    expect(shiftAnchor('2026-03-31', 'month', -1)).toBe('2026-02-28')
    expect(shiftAnchor('2026-12-15', 'month', 1)).toBe('2027-01-15')
    expect(shiftAnchor('2026-10-12', 'week', -1)).toBe('2026-10-05')
    expect(shiftAnchor('2026-10-31', 'day', 1)).toBe('2026-11-01')
  })
  it('분 계산', () => {
    expect(snapMinutes(37)).toBe(30)
    expect(snapMinutes(38)).toBe(45)
    expect(minutesToTime(0)).toBe('00:00')
    expect(minutesToTime(1440)).toBe('23:59')
    expect(addMinutesToTime('2026-10-12', '23:30', 60)).toEqual({
      date: '2026-10-13',
      time: '00:30',
    })
    expect(addMinutesToTime('2026-10-12', '09:00', 60)).toEqual({
      date: '2026-10-12',
      time: '10:00',
    })
  })
})

describe('일정 옮기기 (America/New_York, DST)', () => {
  withTz('America/New_York')

  it('종일 일정은 날짜만 옮긴다', () => {
    const e: EventInput = { ...base, allDay: true, startDate: '2026-10-12', endDate: '2026-10-13' }
    expect(shiftEventDays(e, 3)).toMatchObject({ startDate: '2026-10-15', endDate: '2026-10-16' })
  })

  it('서머타임 시작일(3/8)로 옮겨도 9시는 9시, 길이는 그대로', () => {
    const e = timed('2026-03-07', '09:00', '10:30')
    const moved = shiftEventDays(e, 1) as Extract<EventInput, { allDay: false }>
    expect(localDate(moved.startUtc)).toBe('2026-03-08')
    expect(timeLabel(moved.startUtc)).toBe('09:00')
    expect(moved.endUtc - moved.startUtc).toBe(1.5 * H)
    // 하루를 24시간으로 더했다면 10:00이 되었을 것
    expect(moved.startUtc - e.startUtc).toBe(23 * H)
  })

  it('시간 칸으로 옮기기: 날짜와 시각 지정, 길이 유지, 저장용 필드만 남김', () => {
    const e = { ...timed('2026-10-12', '09:00', '10:00'), id: 'x', createdAt: 1 }
    const moved = moveTimedEvent(e, '2026-10-14', 14 * 60 + 15) as Extract<
      EventInput,
      { allDay: false }
    >
    expect(timeLabel(moved.startUtc)).toBe('14:15')
    expect(localDate(moved.startUtc)).toBe('2026-10-14')
    expect(moved.endUtc - moved.startUtc).toBe(H)
    expect(moved).not.toHaveProperty('id')
  })

  it('서머타임 시작일 배치는 벽시계 분 기준(01:00~04:00 → 60~240)', () => {
    const e = timed('2026-03-08', '01:00', '04:00')
    expect(e.endUtc - e.startUtc).toBe(2 * H) // 실제로는 2시간
    expect(layoutDay([e], '2026-03-08')).toMatchObject([{ startMin: 60, endMin: 240 }])
  })
})

describe('하루 시간 칸 배치', () => {
  withTz('Asia/Seoul')
  const D = '2026-10-12'

  it('겹치는 일정은 열을 나누고, 안 겹치면 한 열', () => {
    const a = timed(D, '09:00', '11:00', 'a')
    const b = timed(D, '10:00', '12:00', 'b')
    const c = timed(D, '10:30', '11:00', 'c')
    const d = timed(D, '13:00', '14:00', 'd')
    const r = layoutDay([d, c, b, a], D)
    const by = (t: string) => r.find((s) => s.event.title === t)!
    expect([by('a').col, by('b').col, by('c').col]).toEqual([0, 1, 2])
    expect(by('a').cols).toBe(3)
    expect(by('d')).toMatchObject({ col: 0, cols: 1, startMin: 780, endMin: 840 })
  })

  it('끝난 열은 다시 쓴다', () => {
    const a = timed(D, '09:00', '10:00', 'a')
    const b = timed(D, '09:30', '11:00', 'b')
    const c = timed(D, '10:00', '10:30', 'c')
    const r = layoutDay([a, b, c], D)
    expect(r.find((s) => s.event.title === 'c')).toMatchObject({ col: 0, cols: 2 })
  })

  it('자정을 넘는 일정은 날짜 경계에서 자르고, 짧은 일정은 최소 길이', () => {
    const night = {
      ...timed(D, '23:00', '23:00'),
      endUtc: localDateTime('2026-10-13', '02:00'),
    }
    expect(layoutDay([night], D)).toMatchObject([{ startMin: 1380, endMin: 1440 }])
    expect(layoutDay([night], '2026-10-13')).toMatchObject([{ startMin: 0, endMin: 120 }])
    expect(layoutDay([timed(D, '09:00', '09:00')], D)).toMatchObject([
      { startMin: 540, endMin: 555 },
    ])
    // 자정에 딱 끝나는 일정은 다음 날에 보이지 않는다
    expect(layoutDay([timed(D, '22:00', '23:00')], '2026-10-13')).toEqual([])
  })
})
