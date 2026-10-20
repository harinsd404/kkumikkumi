import { describe, expect, it } from 'vitest'
import {
  CalendarEventSchema,
  DiaryEntrySchema,
  HabitSchema,
  DEFAULT_POMODORO,
  PomodoroSettingsSchema,
  ThemeRuleSchema,
  TimerSessionSchema,
  TimerStateSchema,
} from '../userdata'
import { U } from './fixtures'

describe('TimerStateSchema', () => {
  const T = (o: object) => ({
    status: 'idle',
    mode: 'focus',
    durationMs: 60000,
    endsAt: null,
    pausedRemainingMs: null,
    pomodoro: null,
    updatedAt: 0,
    ...o,
  })
  it('idle 유효', () => expect(TimerStateSchema.safeParse(T({})).success).toBe(true))
  it('running인데 endsAt 없으면 거부', () =>
    expect(TimerStateSchema.safeParse(T({ status: 'running' })).success).toBe(false))
  it('paused인데 잔여 시간 없으면 거부', () =>
    expect(TimerStateSchema.safeParse(T({ status: 'paused' })).success).toBe(false))
  it('뽀모도로 단계와 mode가 맞아야 한다', () => {
    const ok = T({ pomodoro: { phase: 'shortBreak', round: 1 }, mode: 'break' })
    expect(TimerStateSchema.safeParse(ok).success).toBe(true)
    const bad = T({ pomodoro: { phase: 'focus', round: 1 }, mode: 'break' })
    expect(TimerStateSchema.safeParse(bad).success).toBe(false)
    expect(TimerStateSchema.safeParse(T({ pomodoro: { phase: 'focus', round: 0 } })).success).toBe(
      false,
    )
  })
})

describe('PomodoroSettingsSchema / TimerSessionSchema', () => {
  it('기본값 유효, 범위 밖 거부', () => {
    expect(PomodoroSettingsSchema.safeParse(DEFAULT_POMODORO).success).toBe(true)
    expect(PomodoroSettingsSchema.safeParse({ ...DEFAULT_POMODORO, focusMin: 0 }).success).toBe(
      false,
    )
    expect(PomodoroSettingsSchema.safeParse({ ...DEFAULT_POMODORO, longEvery: 1 }).success).toBe(
      false,
    )
  })
  it('세션: 미지의 키(제목 등) 거부', () => {
    const s = {
      id: U(1),
      kind: 'focus',
      pomodoro: true,
      startedAt: 0,
      endedAt: 1500000,
      plannedMs: 1500000,
      actualMs: 1500000,
      completed: true,
    }
    expect(TimerSessionSchema.safeParse(s).success).toBe(true)
    expect(TimerSessionSchema.safeParse({ ...s, title: '보고서' }).success).toBe(false)
  })
})

describe('CalendarEventSchema', () => {
  const ev = {
    id: U(9),
    title: 'a',
    color: '#ff0000',
    note: '',
    recurrence: null,
    createdAt: 0,
    updatedAt: 0,
  }
  const timed = (o: object) => ({
    ...ev,
    allDay: false,
    startUtc: 1,
    endUtc: 2,
    tzid: 'Asia/Seoul',
    ...o,
  })
  it('시각 일정 유효', () => expect(CalendarEventSchema.safeParse(timed({})).success).toBe(true))
  it('종료 < 시작 거부', () =>
    expect(CalendarEventSchema.safeParse(timed({ startUtc: 5 })).success).toBe(false))
  it('잘못된 타임존 거부', () =>
    expect(CalendarEventSchema.safeParse(timed({ tzid: 'Mars/Base' })).success).toBe(false))
  it('종일 일정 유효', () =>
    expect(
      CalendarEventSchema.safeParse({
        ...ev,
        allDay: true,
        startDate: '2026-10-09',
        endDate: '2026-10-10',
      }).success,
    ).toBe(true))
})

describe('ThemeRuleSchema', () => {
  const rule = (c: object) => ({
    id: U(10),
    themeId: U(1),
    enabled: true,
    priority: 1,
    createdAt: 0,
    updatedAt: 0,
    conditions: { timeRange: null, weekdays: [], mode: 'any', appearance: 'any', ...c },
  })
  it('자정 넘김 구간(22:00~06:00) 유효', () =>
    expect(
      ThemeRuleSchema.safeParse(rule({ timeRange: { start: '22:00', end: '06:00' } })).success,
    ).toBe(true))
  it('시작 = 종료 거부', () =>
    expect(
      ThemeRuleSchema.safeParse(rule({ timeRange: { start: '09:00', end: '09:00' } })).success,
    ).toBe(false))
  it('요일 중복 거부', () =>
    expect(ThemeRuleSchema.safeParse(rule({ weekdays: [1, 1] })).success).toBe(false))
})

describe('일기', () => {
  const ok = {
    date: '2026-10-20',
    body: '시험 끝',
    mood: 5,
    photos: [{ hash: 'a'.repeat(64), mime: 'image/jpeg' }],
    createdAt: 1,
    updatedAt: 1,
  }
  it('기분 1~5 또는 null, 사진 4장까지, 사진은 해시와 PNG/JPEG만', () => {
    expect(DiaryEntrySchema.safeParse(ok).success).toBe(true)
    expect(DiaryEntrySchema.safeParse({ ...ok, mood: null }).success).toBe(true)
    expect(DiaryEntrySchema.safeParse({ ...ok, mood: 0 }).success).toBe(false)
    expect(DiaryEntrySchema.safeParse({ ...ok, photos: Array(5).fill(ok.photos[0]) }).success).toBe(
      false,
    )
    expect(
      DiaryEntrySchema.safeParse({
        ...ok,
        photos: [{ hash: 'a'.repeat(64), mime: 'image/svg+xml' }],
      }).success,
    ).toBe(false)
    expect(DiaryEntrySchema.safeParse({ ...ok, path: '/etc/passwd' }).success).toBe(false)
  })
})

describe('습관', () => {
  const ok = {
    id: '00000000-0000-7000-8000-000000000001',
    name: '물 2L',
    color: '#8fb8de',
    days: 127,
    order: 0,
    createdAt: 1,
    updatedAt: 1,
  }
  it('요일 비트 1~127, 이름 30자', () => {
    expect(HabitSchema.safeParse(ok).success).toBe(true)
    expect(HabitSchema.safeParse({ ...ok, days: 0 }).success).toBe(false)
    expect(HabitSchema.safeParse({ ...ok, days: 128 }).success).toBe(false)
    expect(HabitSchema.safeParse({ ...ok, name: 'x'.repeat(31) }).success).toBe(false)
  })
})
