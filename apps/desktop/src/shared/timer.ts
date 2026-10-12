import {
  DEFAULT_POMODORO,
  type PomodoroSettings,
  type TimerSession,
  type TimerState,
} from '@kkumikkumi/schema'
import { nextPhase, phaseMode, phaseMs, type PomodoroPos } from './pomodoro'

// 타이머 상태 머신(순수 함수). 남은 시간은 항상 endsAt - now로 계산한다(setInterval 카운트다운 금지).
// idle → running(start) → paused(pause) → running(resume) → idle(reset 또는 완료)
// 뽀모도로 사이클 중이면(pomodoro != null) 완료/건너뛰기 때 다음 단계로 넘어간다.

export type TimerMode = TimerState['mode']
export type TimerCommand =
  | { cmd: 'start'; durationMs: number; mode: TimerMode }
  | { cmd: 'pause' }
  | { cmd: 'resume' }
  | { cmd: 'reset' }
  /** 대기 중일 때만: 준비된 단계를 시작하거나, 사이클이 없으면 집중 1회차부터 */
  | { cmd: 'pomodoro.start' }
  /** 다음 단계로(실행/일시정지 중이었으면 바로 시작) */
  | { cmd: 'pomodoro.skip' }
  /** 사이클을 끝내고 일반 타이머 대기로 */
  | { cmd: 'pomodoro.stop' }

export const DEFAULT_TIMER: Omit<TimerState, 'updatedAt'> = {
  status: 'idle',
  mode: 'focus',
  durationMs: 25 * 60 * 1000,
  endsAt: null,
  pausedRemainingMs: null,
  pomodoro: null,
}

/** 뽀모도로 단계를 대기(또는 바로 실행) 상태로 준비 */
function atPhase(pos: PomodoroPos, set: PomodoroSettings, now: number, run: boolean): TimerState {
  const durationMs = phaseMs(pos.phase, set)
  return {
    status: run ? 'running' : 'idle',
    mode: phaseMode(pos.phase),
    durationMs,
    endsAt: run ? now + durationMs : null,
    pausedRemainingMs: null,
    pomodoro: pos,
    updatedAt: now,
  }
}

const idle = (s: TimerState, now: number): TimerState => ({
  ...s,
  status: 'idle',
  endsAt: null,
  pausedRemainingMs: null,
  updatedAt: now,
})

/** 명령 적용. 지금 상태에서 의미 없는 명령(예: idle에서 pause)은 상태를 그대로 돌려준다. */
export function applyTimer(
  s: TimerState,
  c: TimerCommand,
  now: number,
  pomo: PomodoroSettings = DEFAULT_POMODORO,
): TimerState {
  switch (c.cmd) {
    case 'start':
      return {
        status: 'running',
        mode: c.mode,
        durationMs: c.durationMs,
        endsAt: now + c.durationMs,
        pausedRemainingMs: null,
        pomodoro: null,
        updatedAt: now,
      }
    case 'pomodoro.start':
      if (s.status !== 'idle') return s
      return atPhase(s.pomodoro ?? { phase: 'focus', round: 1 }, pomo, now, true)
    case 'pomodoro.skip':
      if (!s.pomodoro) return s
      return atPhase(nextPhase(s.pomodoro, pomo), pomo, now, s.status !== 'idle')
    case 'pomodoro.stop':
      if (!s.pomodoro) return s
      return { ...idle(s, now), mode: 'focus', durationMs: phaseMs('focus', pomo), pomodoro: null }
    case 'pause':
      if (s.status !== 'running' || s.endsAt === null) return s
      return {
        ...s,
        status: 'paused',
        endsAt: null,
        pausedRemainingMs: Math.max(0, s.endsAt - now),
        updatedAt: now,
      }
    case 'resume':
      if (s.status !== 'paused' || s.pausedRemainingMs === null) return s
      return {
        ...s,
        status: 'running',
        endsAt: now + s.pausedRemainingMs,
        pausedRemainingMs: null,
        updatedAt: now,
      }
    case 'reset':
      return s.status === 'idle' ? s : idle(s, now)
  }
}

/** 남은 시간(ms). idle이면 설정된 길이 전체. */
export function remainingMs(s: TimerState, now: number): number {
  if (s.status === 'running' && s.endsAt !== null) return Math.max(0, s.endsAt - now)
  if (s.status === 'paused' && s.pausedRemainingMs !== null) return s.pausedRemainingMs
  return s.durationMs
}

/**
 * 실행 중인데 종료 시각이 지났으면 완료 처리. 앱 재시작/절전 복귀 때 호출한다.
 * 일반 타이머는 idle로. 뽀모도로는 다음 단계를 준비하고, autoStart면 바로 시작한다.
 * 다만 late(앱이 꺼져 있었거나 잠든 사이에 끝남)면 자동 시작하지 않는다: 아무도 모르게 단계가 연달아 흘러가지 않게.
 * completed: 이번 호출로 완료되었는지(알림/기록을 한 번만 하기 위해)
 */
export function settleTimer(
  s: TimerState,
  now: number,
  pomo: PomodoroSettings = DEFAULT_POMODORO,
  late = false,
): { state: TimerState; completed: boolean } {
  if (s.status !== 'running' || s.endsAt === null || s.endsAt > now) {
    return { state: s, completed: false }
  }
  if (!s.pomodoro) return { state: idle(s, now), completed: true }
  return {
    state: atPhase(nextPhase(s.pomodoro, pomo), pomo, now, pomo.autoStart && !late),
    completed: true,
  }
}

/** 기록할 세션(id는 저장할 때 붙인다) */
export type SessionDraft = Omit<TimerSession, 'id'>

/** 이보다 짧게 돌다가 멈춘 타이머는 기록하지 않는다(잘못 누른 경우) */
export const MIN_SESSION_MS = 60_000

/** 끝까지 간 타이머의 기록. 끝난 시각은 실제 종료 시각(endsAt)이다(늦게 정리돼도). */
export function completedSession(s: TimerState): SessionDraft | null {
  if (s.status !== 'running' || s.endsAt === null) return null
  return {
    kind: s.mode,
    pomodoro: s.pomodoro !== null,
    startedAt: s.endsAt - s.durationMs,
    endedAt: s.endsAt,
    plannedMs: s.durationMs,
    actualMs: s.durationMs,
    completed: true,
  }
}

/** 실행/일시정지 중에 멈추거나 건너뛴 타이머의 기록(1분 미만이면 null) */
export function interruptedSession(s: TimerState, now: number): SessionDraft | null {
  if (s.status === 'idle') return null
  const actualMs = Math.max(0, s.durationMs - remainingMs(s, now))
  if (actualMs < MIN_SESSION_MS) return null
  return {
    kind: s.mode,
    pomodoro: s.pomodoro !== null,
    startedAt: now - actualMs,
    endedAt: now,
    plannedMs: s.durationMs,
    actualMs,
    completed: false,
  }
}

/** 집중 모드 = focus 모드로 실행 중 (테마 자동 전환/펫이 구독) */
export const isFocusing = (s: TimerState | null): boolean =>
  s !== null && s.status === 'running' && s.mode === 'focus'

/** mm:ss (1시간 이상이면 h:mm:ss). 남은 초는 올림해서 00:00은 완료 순간에만 보인다. */
export function formatClock(ms: number): string {
  const total = Math.ceil(Math.max(0, ms) / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const sec = total % 60
  const p = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${p(m)}:${p(sec)}` : `${p(m)}:${p(sec)}`
}
