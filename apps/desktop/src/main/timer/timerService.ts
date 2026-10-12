import type { PomodoroSettings, TimerState } from '@kkumikkumi/schema'
import type { TimerDoneInfo } from '../../shared/api'
import { phaseMs } from '../../shared/pomodoro'
import {
  applyTimer,
  completedSession,
  DEFAULT_TIMER,
  interruptedSession,
  settleTimer,
  type SessionDraft,
  type TimerCommand,
} from '../../shared/timer'

/** 진행 중인 타이머를 멈추거나 바꾸는 명령(기록 대상) */
const INTERRUPTS = new Set<TimerCommand['cmd']>([
  'start',
  'reset',
  'pomodoro.skip',
  'pomodoro.stop',
])

export interface TimerServiceDeps {
  load(): TimerState | null
  save(s: TimerState): TimerState
  now(): number
  setTimer(fn: () => void, ms: number): unknown
  clearTimer(handle: unknown): void
  /** 상태가 바뀔 때마다(renderer 전송, 이벤트 버스) */
  onChange(s: TimerState): void
  /** 실행 중이던 타이머가 끝났을 때 한 번 (알림). late: 앱이 꺼져 있던/잠든 사이에 끝남 */
  onComplete(info: TimerDoneInfo): void
  /** 지금 뽀모도로 설정(바뀔 수 있어 매번 읽는다) */
  pomodoro(): PomodoroSettings
  /** 끝났거나 1분 넘게 돌다 멈춘 타이머 기록 */
  onSession(s: SessionDraft): void
}

// setTimeout 최대 지연(약 24.8일). 타이머 길이는 24시간 이하라 넘지 않지만 방어한다.
const MAX_DELAY = 2 ** 31 - 1

/**
 * 타이머 상태의 단일 소유자(main). 카운트다운은 하지 않고, 종료 시각에 한 번 깨어나는 단발 타이머만 건다.
 * 절전 복귀(recheck)와 앱 시작(init)에서 종료 시각이 지났으면 즉시 완료한다.
 */
export class TimerService {
  private state: TimerState
  private handle: unknown = null

  constructor(private readonly d: TimerServiceDeps) {
    this.state = d.load() ?? { ...DEFAULT_TIMER, updatedAt: d.now() }
  }

  /** 앱 시작 시 한 번. 꺼져 있는 동안 끝났으면 완료 처리. */
  init(): void {
    this.settle(true)
    this.schedule()
  }

  get(): TimerState {
    return this.state
  }

  command(c: TimerCommand): TimerState {
    this.settle(false) // 끝난 타이머에 pause 같은 명령이 늦게 와도 먼저 완료로 정리
    const prev = this.state
    const now = this.d.now()
    const next = applyTimer(prev, c, now, this.d.pomodoro())
    if (next !== prev) {
      const rec = INTERRUPTS.has(c.cmd) ? interruptedSession(prev, now) : null
      this.commit(next)
      if (rec) this.d.onSession(rec)
    }
    this.schedule()
    return this.state
  }

  /** 뽀모도로 설정이 바뀌면 대기 중인 단계의 길이를 새 설정으로 맞춘다 */
  applySettings(): void {
    const s = this.state
    if (s.status !== 'idle' || !s.pomodoro) return
    const durationMs = phaseMs(s.pomodoro.phase, this.d.pomodoro())
    if (durationMs !== s.durationMs) this.commit({ ...s, durationMs, updatedAt: this.d.now() })
  }

  /** 절전 복귀, 시계 변경 등 "시간이 튀었을 수 있는" 시점 */
  recheck(): void {
    this.settle(true)
    this.schedule()
  }

  dispose(): void {
    if (this.handle !== null) this.d.clearTimer(this.handle)
    this.handle = null
  }

  private settle(late: boolean): void {
    const before = this.state
    const { state, completed } = settleTimer(before, this.d.now(), this.d.pomodoro(), late)
    if (!completed) return
    const rec = completedSession(before)
    this.commit(state)
    if (rec) this.d.onSession(rec)
    this.d.onComplete({
      mode: before.mode,
      late,
      next: state.pomodoro
        ? { phase: state.pomodoro.phase, started: state.status === 'running' }
        : null,
    })
  }

  private commit(s: TimerState): void {
    this.state = this.d.save(s)
    this.d.onChange(this.state)
  }

  private schedule(): void {
    this.dispose()
    const s = this.state
    if (s.status !== 'running' || s.endsAt === null) return
    const delay = Math.min(MAX_DELAY, Math.max(0, s.endsAt - this.d.now()))
    this.handle = this.d.setTimer(() => {
      this.handle = null
      // 일찍 깨면(시계 보정 등) 아직 실행 중이라 다시 걸고,
      // 뽀모도로 자동 시작이면 다음 단계의 종료 시각에 다시 건다
      this.settle(false)
      this.schedule()
    }, delay)
  }
}
