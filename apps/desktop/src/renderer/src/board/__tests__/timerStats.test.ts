import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { localDateTime } from '../calendar'
import { focusByDay, formatDuration, lastDays, studyStreak, summarize } from '../timerStats'

declare const process: { env: Record<string, string | undefined> }
const prev = process.env['TZ']
beforeAll(() => {
  process.env['TZ'] = 'Asia/Seoul'
})
afterAll(() => {
  if (prev === undefined) delete process.env['TZ']
  else process.env['TZ'] = prev
})

const MIN = 60_000
const s = (
  date: string,
  time: string,
  min: number,
  kind: 'focus' | 'break' = 'focus',
  completed = true,
) => ({
  kind,
  endedAt: localDateTime(date, time),
  actualMs: min * MIN,
  completed,
})

describe('타이머 통계', () => {
  const T = '2026-10-12'
  const sessions = [
    s(T, '09:25', 25),
    s(T, '10:00', 5, 'break'),
    s(T, '11:00', 12, 'focus', false),
    s('2026-10-11', '23:59', 25),
    s('2026-10-13', '00:10', 30), // 자정을 넘긴 집중: 끝난 날(13일)
    s('2026-10-01', '12:00', 50), // 범위 밖
  ]

  it('날짜별 집중 시간: 휴식 제외, 끝난 날 기준, 범위 밖 무시', () => {
    const m = focusByDay(sessions, ['2026-10-11', T, '2026-10-13'])
    expect(m.get('2026-10-11')).toBe(25 * MIN)
    expect(m.get(T)).toBe(37 * MIN)
    expect(m.get('2026-10-13')).toBe(30 * MIN)
  })

  it('오늘/이번 주/오늘 완료 횟수', () => {
    const week = [
      '2026-10-11',
      T,
      '2026-10-13',
      '2026-10-14',
      '2026-10-15',
      '2026-10-16',
      '2026-10-17',
    ]
    expect(summarize(sessions, T, week)).toEqual({
      todayMs: 37 * MIN,
      weekMs: 92 * MIN,
      todayDone: 1,
    })
  })

  it('최근 n일과 시간 표시', () => {
    expect(lastDays(T, 3)).toEqual(['2026-10-10', '2026-10-11', T])
    expect(formatDuration(0)).toBe('0분')
    expect(formatDuration(25 * MIN + 59_000)).toBe('25분')
    expect(formatDuration(60 * MIN)).toBe('1시간')
    expect(formatDuration(125 * MIN)).toBe('2시간 5분')
  })
})

describe('studyStreak', () => {
  const at = (date: string, ms = 25 * 60_000, kind: 'focus' | 'break' = 'focus') => ({
    kind,
    endedAt: localDateTime(date, '20:00'),
    actualMs: ms,
    completed: true,
  })
  it('오늘부터 거꾸로 이어진 날, 오늘 아직이면 어제부터, 휴식은 세지 않는다', () => {
    const s = [at('2026-10-18'), at('2026-10-19'), at('2026-10-20'), at('2026-10-16')]
    expect(studyStreak(s, '2026-10-20')).toBe(3)
    expect(studyStreak(s, '2026-10-21')).toBe(3)
    expect(studyStreak(s, '2026-10-22')).toBe(0)
    expect(studyStreak([at('2026-10-20', 60_000, 'break')], '2026-10-20')).toBe(0)
  })
})
