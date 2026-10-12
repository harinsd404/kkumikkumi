import { TimerStateSchema, type TimerState } from '@kkumikkumi/schema'
import type { Db } from '../connection'
import type { Row } from './rows'

/** 타이머 상태는 단일 행(id = 1). 없으면 null. */
export class TimerRepo {
  constructor(private readonly db: Db) {}

  get(): TimerState | null {
    const r = this.db.prepare('SELECT * FROM timer_state WHERE id = 1').get() as Row | undefined
    if (!r) return null
    return TimerStateSchema.parse({
      status: r['status'],
      mode: r['mode'],
      durationMs: r['duration_ms'],
      endsAt: r['ends_at'],
      pausedRemainingMs: r['paused_remaining_ms'],
      updatedAt: r['updated_at'],
    })
  }

  save(state: TimerState): TimerState {
    const s = TimerStateSchema.parse(state)
    this.db
      .prepare(
        `INSERT INTO timer_state (id, status, mode, duration_ms, ends_at, paused_remaining_ms, updated_at)
         VALUES (1, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET status = excluded.status, mode = excluded.mode,
           duration_ms = excluded.duration_ms, ends_at = excluded.ends_at,
           paused_remaining_ms = excluded.paused_remaining_ms, updated_at = excluded.updated_at`,
      )
      .run(s.status, s.mode, s.durationMs, s.endsAt, s.pausedRemainingMs, s.updatedAt)
    return s
  }
}
