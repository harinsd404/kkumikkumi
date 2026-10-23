import { TimerSessionSchema, type TimerSession } from '@kkumikkumi/schema'
import type { Db } from '../connection'
import { bool, int, type Row } from './rows'

const toSession = (r: Row): TimerSession =>
  TimerSessionSchema.parse({
    id: r['id'],
    kind: r['kind'],
    pomodoro: bool(r['pomodoro']!),
    startedAt: r['started_at'],
    endedAt: r['ended_at'],
    plannedMs: r['planned_ms'],
    actualMs: r['actual_ms'],
    completed: bool(r['completed']!),
  })

/** 타이머 기록(통계). 시각과 길이만 저장한다. */
export class TimerSessionRepo {
  constructor(private readonly db: Db) {}

  all() {
    return (this.db.prepare('SELECT * FROM timer_sessions ORDER BY id').all() as Row[]).map(
      toSession,
    )
  }

  insert(session: TimerSession): TimerSession {
    const s = TimerSessionSchema.parse(session)
    this.db
      .prepare(
        `INSERT INTO timer_sessions (id, kind, pomodoro, started_at, ended_at, planned_ms, actual_ms, completed)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        s.id,
        s.kind,
        int(s.pomodoro),
        s.startedAt,
        s.endedAt,
        s.plannedMs,
        s.actualMs,
        int(s.completed),
      )
    return s
  }

  /** 끝난 시각이 [fromMs, toMs) 안인 기록, 최근 순 */
  endedBetween(fromMs: number, toMs: number, limit = 1000): TimerSession[] {
    return (
      this.db
        .prepare(
          'SELECT * FROM timer_sessions WHERE ended_at >= ? AND ended_at < ? ORDER BY ended_at DESC LIMIT ?',
        )
        .all(fromMs, toMs, limit) as Row[]
    ).map(toSession)
  }
}
