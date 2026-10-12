import type { TimerState } from '@kkumikkumi/schema'
import { DEFAULT_POMODORO, TimerStateSchema } from '@kkumikkumi/schema'
import { describe, expect, it } from 'vitest'
import { nextPhase, phaseText } from '../pomodoro'
import {
  applyTimer,
  completedSession,
  DEFAULT_TIMER,
  formatClock,
  interruptedSession,
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

describe('뽀모도로', () => {
  const P = DEFAULT_POMODORO
  it('단계 순서: 집중 → 짧은 휴식 … 4번째 집중 뒤 긴 휴식 → 1회차', () => {
    let pos = { phase: 'focus' as const, round: 1 } as ReturnType<typeof nextPhase>
    const seen: string[] = []
    for (let i = 0; i < 9; i++) {
      seen.push(`${pos.phase}${pos.round}`)
      pos = nextPhase(pos, P)
    }
    expect(seen).toEqual([
      'focus1',
      'shortBreak1',
      'focus2',
      'shortBreak2',
      'focus3',
      'shortBreak3',
      'focus4',
      'longBreak4',
      'focus1',
    ])
    expect(phaseText({ phase: 'focus', round: 2 }, P)).toBe('집중 2/4')
    expect(phaseText({ phase: 'longBreak', round: 4 }, P)).toBe('긴 휴식')
  })

  it('pomodoro.start: 대기 중에만, 준비된 단계가 있으면 그것부터', () => {
    const s = applyTimer(base, { cmd: 'pomodoro.start' }, T0)
    expect(s).toMatchObject({ status: 'running', mode: 'focus', durationMs: 25 * MIN })
    expect(s.pomodoro).toEqual({ phase: 'focus', round: 1 })
    expect(valid(s)).toBe(true)
    expect(applyTimer(s, { cmd: 'pomodoro.start' }, T0 + MIN)).toBe(s) // 실행 중이면 무시
    const prepared: TimerState = {
      ...base,
      mode: 'break',
      durationMs: 5 * MIN,
      pomodoro: { phase: 'shortBreak', round: 2 },
    }
    expect(applyTimer(prepared, { cmd: 'pomodoro.start' }, T0)).toMatchObject({
      status: 'running',
      endsAt: T0 + 5 * MIN,
      pomodoro: { phase: 'shortBreak', round: 2 },
    })
  })

  it('skip/stop은 사이클 중에만, 일반 start는 사이클을 끝낸다', () => {
    expect(applyTimer(base, { cmd: 'pomodoro.skip' }, T0)).toBe(base)
    expect(applyTimer(base, { cmd: 'pomodoro.stop' }, T0)).toBe(base)
    const run = applyTimer(base, { cmd: 'pomodoro.start' }, T0)
    const paused = applyTimer(run, { cmd: 'pause' }, T0 + MIN)
    expect(applyTimer(paused, { cmd: 'pomodoro.skip' }, T0 + 2 * MIN)).toMatchObject({
      status: 'running',
      mode: 'break',
      pomodoro: { phase: 'shortBreak', round: 1 },
    })
    const stopped = applyTimer(run, { cmd: 'pomodoro.stop' }, T0 + MIN)
    expect(stopped).toMatchObject({ status: 'idle', mode: 'focus', pomodoro: null })
    expect(valid(stopped)).toBe(true)
    const plain = applyTimer(run, { cmd: 'start', durationMs: MIN, mode: 'break' }, T0)
    expect(plain.pomodoro).toBeNull()
  })

  it('reset은 같은 단계로 대기(사이클 유지)', () => {
    const run = applyTimer(base, { cmd: 'pomodoro.start' }, T0)
    expect(applyTimer(run, { cmd: 'reset' }, T0 + MIN)).toMatchObject({
      status: 'idle',
      durationMs: 25 * MIN,
      pomodoro: { phase: 'focus', round: 1 },
    })
  })

  it('settle: 다음 단계 준비, autoStart면 바로 실행, late면 실행하지 않음', () => {
    const run = applyTimer(base, { cmd: 'pomodoro.start' }, T0)
    const end = T0 + 25 * MIN
    const off = settleTimer(run, end, P)
    expect(off.completed).toBe(true)
    expect(off.state).toMatchObject({ status: 'idle', mode: 'break', durationMs: 5 * MIN })
    const on = settleTimer(run, end, { ...P, autoStart: true })
    expect(on.state).toMatchObject({ status: 'running', endsAt: end + 5 * MIN })
    expect(valid(on.state)).toBe(true)
    expect(settleTimer(run, end, { ...P, autoStart: true }, true).state.status).toBe('idle')
  })
})

describe('기록', () => {
  it('완료 기록은 실제 종료 시각(endsAt) 기준', () => {
    const run = applyTimer(base, { cmd: 'start', durationMs: 10 * MIN, mode: 'focus' }, T0)
    expect(completedSession(run)).toEqual({
      kind: 'focus',
      pomodoro: false,
      startedAt: T0,
      endedAt: T0 + 10 * MIN,
      plannedMs: 10 * MIN,
      actualMs: 10 * MIN,
      completed: true,
    })
    expect(completedSession(base)).toBeNull()
  })
  it('중단 기록: 진행한 만큼, 1분 미만이면 없음, 일시정지 중이면 멈춘 시점까지', () => {
    const run = applyTimer(base, { cmd: 'start', durationMs: 10 * MIN, mode: 'break' }, T0)
    expect(interruptedSession(run, T0 + 59_000)).toBeNull()
    expect(interruptedSession(run, T0 + 4 * MIN)).toMatchObject({
      kind: 'break',
      actualMs: 4 * MIN,
      endedAt: T0 + 4 * MIN,
      completed: false,
    })
    const paused = applyTimer(run, { cmd: 'pause' }, T0 + 2 * MIN)
    expect(interruptedSession(paused, T0 + 60 * MIN)?.actualMs).toBe(2 * MIN)
    expect(interruptedSession(base, T0)).toBeNull()
  })
})
