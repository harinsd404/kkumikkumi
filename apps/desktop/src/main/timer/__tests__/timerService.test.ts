import { DEFAULT_POMODORO, type PomodoroSettings, type TimerState } from '@kkumikkumi/schema'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TimerDoneInfo } from '../../../shared/api'
import type { SessionDraft } from '../../../shared/timer'
import { TimerService } from '../timerService'

const MIN = 60_000

function setup(initial: TimerState | null = null, pomo: Partial<PomodoroSettings> = {}) {
  let stored = initial
  const changes: TimerState[] = []
  const done: TimerDoneInfo[] = []
  const sessions: SessionDraft[] = []
  const settings = { ...DEFAULT_POMODORO, ...pomo }
  const svc = new TimerService({
    load: () => stored,
    save: (s) => (stored = s),
    now: () => Date.now(),
    setTimer: (fn, ms) => setTimeout(fn, ms),
    clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
    onChange: (s) => changes.push(s),
    onComplete: (i) => done.push(i),
    pomodoro: () => settings,
    onSession: (r) => sessions.push(r),
  })
  return { svc, changes, done, sessions, settings, stored: () => stored }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(1_800_000_000_000)
})
afterEach(() => {
  vi.useRealTimers()
})

describe('TimerService', () => {
  it('시작하면 종료 시각에 한 번 완료되고 저장된다', () => {
    const { svc, done, stored } = setup()
    svc.init()
    svc.command({ cmd: 'start', durationMs: 10 * MIN, mode: 'focus' })
    expect(stored()?.status).toBe('running')
    vi.advanceTimersByTime(10 * MIN - 1)
    expect(done).toEqual([])
    vi.advanceTimersByTime(1)
    expect(done).toEqual([{ mode: 'focus', late: false, next: null }])
    expect(stored()?.status).toBe('idle')
    vi.advanceTimersByTime(60 * MIN)
    expect(done).toHaveLength(1)
  })
  it('일시정지하면 완료 타이머가 걸리지 않고, 이어하면 남은 만큼 다시 건다', () => {
    const { svc, done } = setup()
    svc.command({ cmd: 'start', durationMs: 10 * MIN, mode: 'focus' })
    vi.advanceTimersByTime(4 * MIN)
    svc.command({ cmd: 'pause' })
    vi.advanceTimersByTime(60 * MIN)
    expect(done).toEqual([])
    svc.command({ cmd: 'resume' })
    vi.advanceTimersByTime(6 * MIN)
    expect(done).toHaveLength(1)
  })
  it('reset은 예약된 완료를 취소한다', () => {
    const { svc, done } = setup()
    svc.command({ cmd: 'start', durationMs: MIN, mode: 'break' })
    svc.command({ cmd: 'reset' })
    vi.advanceTimersByTime(5 * MIN)
    expect(done).toEqual([])
    expect(svc.get().status).toBe('idle')
  })
  it('앱 재시작: 꺼져 있는 동안 끝났으면 즉시 완료(late)', () => {
    const now = Date.now()
    const { svc, done } = setup({
      status: 'running',
      mode: 'focus',
      durationMs: 10 * MIN,
      endsAt: now - 1,
      pausedRemainingMs: null,
      pomodoro: null,
      updatedAt: now - 10 * MIN,
    })
    svc.init()
    expect(done).toEqual([{ mode: 'focus', late: true, next: null }])
    expect(svc.get().status).toBe('idle')
  })
  it('앱 재시작: 아직 안 끝났으면 남은 시간에 완료', () => {
    const now = Date.now()
    const { svc, done } = setup({
      status: 'running',
      mode: 'focus',
      durationMs: 10 * MIN,
      endsAt: now + 3 * MIN,
      pausedRemainingMs: null,
      pomodoro: null,
      updatedAt: now,
    })
    svc.init()
    expect(done).toEqual([])
    vi.advanceTimersByTime(3 * MIN)
    expect(done).toEqual([{ mode: 'focus', late: false, next: null }])
  })
  it('절전 복귀: 잠든 사이 종료 시각이 지났으면 recheck에서 완료(late)', () => {
    const { svc, done } = setup()
    svc.command({ cmd: 'start', durationMs: 10 * MIN, mode: 'focus' })
    // 잠든 동안에는 타이머가 돌지 않는 상황을 흉내: 시계만 앞으로
    vi.setSystemTime(Date.now() + 30 * MIN)
    svc.recheck()
    expect(done).toEqual([{ mode: 'focus', late: true, next: null }])
    vi.advanceTimersByTime(60 * MIN)
    expect(done).toHaveLength(1)
  })
  it('타이머가 일찍 깨면 다시 건다', () => {
    const { svc, done } = setup()
    svc.command({ cmd: 'start', durationMs: 10 * MIN, mode: 'focus' })
    vi.setSystemTime(Date.now() - 2 * MIN) // 시계가 뒤로 감 → 예약 시점에 아직 안 끝남
    vi.advanceTimersByTime(10 * MIN)
    expect(done).toEqual([])
    vi.advanceTimersByTime(2 * MIN)
    expect(done).toHaveLength(1)
  })
  it('변경마다 onChange', () => {
    const { svc, changes } = setup()
    svc.command({ cmd: 'start', durationMs: MIN, mode: 'focus' })
    svc.command({ cmd: 'pause' })
    svc.command({ cmd: 'pause' }) // 의미 없음 → 알리지 않음
    expect(changes.map((c) => c.status)).toEqual(['running', 'paused'])
  })
})

describe('TimerService 뽀모도로와 기록', () => {
  it('집중이 끝나면 짧은 휴식을 준비하고(자동 시작 꺼짐) 완료 기록을 남긴다', () => {
    const { svc, done, sessions } = setup()
    svc.command({ cmd: 'pomodoro.start' })
    expect(svc.get()).toMatchObject({ status: 'running', durationMs: 25 * MIN })
    vi.advanceTimersByTime(25 * MIN)
    expect(done).toEqual([
      { mode: 'focus', late: false, next: { phase: 'shortBreak', started: false } },
    ])
    expect(svc.get()).toMatchObject({
      status: 'idle',
      mode: 'break',
      durationMs: 5 * MIN,
      pomodoro: { phase: 'shortBreak', round: 1 },
    })
    expect(sessions).toEqual([
      expect.objectContaining({
        kind: 'focus',
        pomodoro: true,
        completed: true,
        actualMs: 25 * MIN,
      }),
    ])
  })

  it('자동 시작이 켜져 있으면 다음 단계를 바로 시작한다', () => {
    const { svc, done } = setup(null, { autoStart: true })
    svc.command({ cmd: 'pomodoro.start' })
    vi.advanceTimersByTime(25 * MIN)
    expect(done[0]?.next).toEqual({ phase: 'shortBreak', started: true })
    expect(svc.get().status).toBe('running')
    vi.advanceTimersByTime(5 * MIN) // 휴식도 끝나면 2회차 집중
    expect(svc.get()).toMatchObject({ status: 'running', pomodoro: { phase: 'focus', round: 2 } })
  })

  it('잠든 사이에 끝나면(late) 자동 시작이 켜져 있어도 준비만 한다', () => {
    const { svc, done } = setup(null, { autoStart: true })
    svc.command({ cmd: 'pomodoro.start' })
    vi.setSystemTime(Date.now() + 3 * 60 * MIN)
    svc.recheck()
    expect(done).toEqual([
      { mode: 'focus', late: true, next: { phase: 'shortBreak', started: false } },
    ])
    expect(svc.get().status).toBe('idle')
    vi.advanceTimersByTime(60 * MIN)
    expect(done).toHaveLength(1) // 단계가 몰래 이어지지 않는다
  })

  it('중간에 멈추면 1분 이상일 때만 미완료 기록', () => {
    const { svc, sessions } = setup()
    svc.command({ cmd: 'start', durationMs: 10 * MIN, mode: 'focus' })
    vi.advanceTimersByTime(30_000)
    svc.command({ cmd: 'reset' })
    expect(sessions).toEqual([])
    svc.command({ cmd: 'start', durationMs: 10 * MIN, mode: 'focus' })
    vi.advanceTimersByTime(3 * MIN)
    svc.command({ cmd: 'reset' })
    expect(sessions).toEqual([
      expect.objectContaining({ completed: false, actualMs: 3 * MIN, plannedMs: 10 * MIN }),
    ])
  })

  it('건너뛰기: 실행 중이면 다음 단계를 바로 시작하고 미완료 기록', () => {
    const { svc, sessions } = setup()
    svc.command({ cmd: 'pomodoro.start' })
    vi.advanceTimersByTime(10 * MIN)
    svc.command({ cmd: 'pomodoro.skip' })
    expect(svc.get()).toMatchObject({ status: 'running', pomodoro: { phase: 'shortBreak' } })
    expect(sessions).toEqual([expect.objectContaining({ completed: false, actualMs: 10 * MIN })])
  })

  it('설정을 바꾸면 대기 중인 단계 길이가 따라간다', () => {
    const { svc, settings } = setup()
    svc.command({ cmd: 'pomodoro.start' })
    svc.command({ cmd: 'reset' })
    settings.focusMin = 50
    svc.applySettings()
    expect(svc.get()).toMatchObject({ status: 'idle', durationMs: 50 * MIN })
  })
})
