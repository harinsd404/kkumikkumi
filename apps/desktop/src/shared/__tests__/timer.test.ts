import type { TimerState } from '@kkumikkumi/schema'
import { TimerStateSchema } from '@kkumikkumi/schema'
import { describe, expect, it } from 'vitest'
import {
  applyTimer,
  DEFAULT_TIMER,
  formatClock,
  isFocusing,
  remainingMs,
  settleTimer,
} from '../timer'

const MIN = 60_000
const T0 = 1_800_000_000_000
const base: TimerState = { ...DEFAULT_TIMER, updatedAt: T0 }
const valid = (s: TimerState) => TimerStateSchema.safeParse(s).success

describe('타이머 상태 머신', () => {
  it('start → endsAt = now + 길이', () => {
    const s = applyTimer(base, { cmd: 'start', durationMs: 10 * MIN, mode: 'focus' }, T0)
    expect(s).toMatchObject({ status: 'running', endsAt: T0 + 10 * MIN, durationMs: 10 * MIN })
    expect(remainingMs(s, T0 + 4 * MIN)).toBe(6 * MIN)
    expect(valid(s)).toBe(true)
  })
  it('pause는 남은 시간을 고정하고 resume은 그만큼 다시 센다', () => {
    let s = applyTimer(base, { cmd: 'start', durationMs: 10 * MIN, mode: 'focus' }, T0)
    s = applyTimer(s, { cmd: 'pause' }, T0 + 3 * MIN)
    expect(s).toMatchObject({ status: 'paused', endsAt: null, pausedRemainingMs: 7 * MIN })
    expect(remainingMs(s, T0 + 60 * MIN)).toBe(7 * MIN) // 멈춘 동안 줄지 않음
    expect(valid(s)).toBe(true)
    s = applyTimer(s, { cmd: 'resume' }, T0 + 60 * MIN)
    expect(s).toMatchObject({ status: 'running', endsAt: T0 + 67 * MIN, pausedRemainingMs: null })
    expect(valid(s)).toBe(true)
  })
  it('의미 없는 명령은 상태를 바꾸지 않는다', () => {
    expect(applyTimer(base, { cmd: 'pause' }, T0)).toBe(base)
    expect(applyTimer(base, { cmd: 'resume' }, T0)).toBe(base)
    expect(applyTimer(base, { cmd: 'reset' }, T0)).toBe(base)
  })
  it('reset은 idle로, 길이와 모드는 유지', () => {
    const s = applyTimer(
      applyTimer(base, { cmd: 'start', durationMs: 5 * MIN, mode: 'break' }, T0),
      { cmd: 'reset' },
      T0 + MIN,
    )
    expect(s).toMatchObject({ status: 'idle', mode: 'break', durationMs: 5 * MIN, endsAt: null })
    expect(remainingMs(s, T0 + MIN)).toBe(5 * MIN)
  })
  it('settle: 종료 시각이 지났으면 완료(재시작/절전 복귀), 아니면 그대로', () => {
    const s = applyTimer(base, { cmd: 'start', durationMs: 10 * MIN, mode: 'focus' }, T0)
    expect(settleTimer(s, T0 + 9 * MIN)).toEqual({ state: s, completed: false })
    const r = settleTimer(s, T0 + 10 * MIN)
    expect(r.completed).toBe(true)
    expect(r.state).toMatchObject({ status: 'idle', endsAt: null })
    expect(settleTimer(r.state, T0 + 11 * MIN).completed).toBe(false) // 두 번 완료되지 않음
    // 일시정지 상태는 시간이 지나도 완료되지 않는다
    const p = applyTimer(s, { cmd: 'pause' }, T0 + MIN)
    expect(settleTimer(p, T0 + 999 * MIN).completed).toBe(false)
  })
  it('집중 모드 = focus + running', () => {
    const f = applyTimer(base, { cmd: 'start', durationMs: MIN, mode: 'focus' }, T0)
    expect(isFocusing(f)).toBe(true)
    expect(isFocusing(applyTimer(f, { cmd: 'pause' }, T0))).toBe(false)
    expect(isFocusing(applyTimer(base, { cmd: 'start', durationMs: MIN, mode: 'break' }, T0))).toBe(
      false,
    )
    expect(isFocusing(null)).toBe(false)
  })
  it('시계 표시', () => {
    expect(formatClock(25 * MIN)).toBe('25:00')
    expect(formatClock(1)).toBe('00:01') // 올림
    expect(formatClock(0)).toBe('00:00')
    expect(formatClock(-5)).toBe('00:00')
    expect(formatClock(90 * MIN + 5000)).toBe('1:30:05')
  })
})
