import type { TimerState } from '@kkumikkumi/schema'

// 타이머 상태 머신(순수 함수). 남은 시간은 항상 endsAt - now로 계산한다(setInterval 카운트다운 금지).
// idle → running(start) → paused(pause) → running(resume) → idle(reset 또는 완료)

export type TimerMode = TimerState['mode']
export type TimerCommand =
  | { cmd: 'start'; durationMs: number; mode: TimerMode }
  | { cmd: 'pause' }
  | { cmd: 'resume' }
  | { cmd: 'reset' }

export const DEFAULT_TIMER: Omit<TimerState, 'updatedAt'> = {
  status: 'idle',
  mode: 'focus',
  durationMs: 25 * 60 * 1000,
  endsAt: null,
  pausedRemainingMs: null,
}

const idle = (s: TimerState, now: number): TimerState => ({
  ...s,
  status: 'idle',
  endsAt: null,
  pausedRemainingMs: null,
  updatedAt: now,
})

/** 명령 적용. 지금 상태에서 의미 없는 명령(예: idle에서 pause)은 상태를 그대로 돌려준다. */
export function applyTimer(s: TimerState, c: TimerCommand, now: number): TimerState {
  switch (c.cmd) {
    case 'start':
      return {
        status: 'running',
        mode: c.mode,
        durationMs: c.durationMs,
        endsAt: now + c.durationMs,
        pausedRemainingMs: null,
        updatedAt: now,
      }
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
 * 실행 중인데 종료 시각이 지났으면 완료 처리(idle). 앱 재시작/절전 복귀 때 호출한다.
 * completed: 이번 호출로 완료되었는지(알림을 한 번만 보내기 위해)
 */
export function settleTimer(s: TimerState, now: number): { state: TimerState; completed: boolean } {
  if (s.status === 'running' && s.endsAt !== null && s.endsAt <= now) {
    return { state: idle(s, now), completed: true }
  }
  return { state: s, completed: false }
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
