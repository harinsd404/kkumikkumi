import type { TimerState } from '@kkumikkumi/schema'
import {
  applyTimer,
  DEFAULT_TIMER,
  settleTimer,
  type TimerCommand,
  type TimerMode,
} from '../../shared/timer'

export interface TimerServiceDeps {
  load(): TimerState | null
  save(s: TimerState): TimerState
  now(): number
  setTimer(fn: () => void, ms: number): unknown
  clearTimer(handle: unknown): void
  /** 상태가 바뀔 때마다(renderer 전송, 이벤트 버스) */
  onChange(s: TimerState): void
  /** 실행 중이던 타이머가 끝났을 때 한 번 (알림). late: 앱이 꺼져 있던/잠든 사이에 끝남 */
  onComplete(info: { mode: TimerMode; late: boolean }): void
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
    const next = applyTimer(this.state, c, this.d.now())
    if (next !== this.state) this.commit(next)
    this.schedule()
    return this.state
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
    const { state, completed } = settleTimer(this.state, this.d.now())
    if (!completed) return
    const mode = this.state.mode
    this.commit(state)
    this.d.onComplete({ mode, late })
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
      // 타이머가 일찍 깨는 경우(시계 보정 등)를 대비해 settle 후 다시 건다
      const before = this.state
      this.settle(false)
      if (this.state === before) this.schedule()
    }, delay)
  }
}
