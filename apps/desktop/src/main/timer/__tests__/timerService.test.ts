import type { TimerState } from '@kkumikkumi/schema'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TimerService } from '../timerService'

const MIN = 60_000

function setup(initial: TimerState | null = null) {
  let stored = initial
  const changes: TimerState[] = []
  const done: { mode: string; late: boolean }[] = []
  const svc = new TimerService({
    load: () => stored,
    save: (s) => (stored = s),
    now: () => Date.now(),
    setTimer: (fn, ms) => setTimeout(fn, ms),
    clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
    onChange: (s) => changes.push(s),
    onComplete: (i) => done.push(i),
  })
  return { svc, changes, done, stored: () => stored }
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
    expect(done).toEqual([{ mode: 'focus', late: false }])
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
      updatedAt: now - 10 * MIN,
    })
    svc.init()
    expect(done).toEqual([{ mode: 'focus', late: true }])
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
      updatedAt: now,
    })
    svc.init()
    expect(done).toEqual([])
    vi.advanceTimersByTime(3 * MIN)
    expect(done).toEqual([{ mode: 'focus', late: false }])
  })
  it('절전 복귀: 잠든 사이 종료 시각이 지났으면 recheck에서 완료(late)', () => {
    const { svc, done } = setup()
    svc.command({ cmd: 'start', durationMs: 10 * MIN, mode: 'focus' })
    // 잠든 동안에는 타이머가 돌지 않는 상황을 흉내: 시계만 앞으로
    vi.setSystemTime(Date.now() + 30 * MIN)
    svc.recheck()
    expect(done).toEqual([{ mode: 'focus', late: true }])
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
