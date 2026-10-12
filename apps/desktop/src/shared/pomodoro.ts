import type { PomodoroPhase, PomodoroSettings, TimerState } from '@kkumikkumi/schema'

// 뽀모도로 사이클(순수 함수): 집중 → 짧은 휴식 → … → longEvery번째 집중 뒤 긴 휴식 → 집중 1회차.

export type PomodoroPos = NonNullable<TimerState['pomodoro']>

const MIN = 60_000

export const PHASE_LABEL: Record<PomodoroPhase, string> = {
  focus: '집중',
  shortBreak: '짧은 휴식',
  longBreak: '긴 휴식',
}

export const phaseMode = (p: PomodoroPhase): TimerState['mode'] =>
  p === 'focus' ? 'focus' : 'break'

export function phaseMs(p: PomodoroPhase, s: PomodoroSettings): number {
  const min = p === 'focus' ? s.focusMin : p === 'shortBreak' ? s.shortBreakMin : s.longBreakMin
  return min * MIN
}

/** 다음 단계. 휴식 뒤의 집중은 회차가 하나 늘고, 긴 휴식 뒤에는 1회차로 돌아간다. */
export function nextPhase(cur: PomodoroPos, s: PomodoroSettings): PomodoroPos {
  if (cur.phase === 'focus') {
    return { phase: cur.round % s.longEvery === 0 ? 'longBreak' : 'shortBreak', round: cur.round }
  }
  if (cur.phase === 'longBreak') return { phase: 'focus', round: 1 }
  return { phase: 'focus', round: Math.min(99, cur.round + 1) }
}

/** "집중 2/4" 처럼 사이클 안의 위치 */
export function phaseText(pos: PomodoroPos, s: PomodoroSettings): string {
  const n = ((pos.round - 1) % s.longEvery) + 1
  return pos.phase === 'focus' ? `집중 ${n}/${s.longEvery}` : PHASE_LABEL[pos.phase]
}
