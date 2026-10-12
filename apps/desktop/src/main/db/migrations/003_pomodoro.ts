import type { Migration } from '../migrate'

/** 뽀모도로 단계(타이머 상태, JSON) + 타이머 기록(통계). 기존 타이머는 일반 타이머(null). */
export const m003Pomodoro: Migration = {
  version: 3,
  name: 'pomodoro',
  up(db) {
    db.exec(`
      ALTER TABLE timer_state ADD COLUMN pomodoro TEXT;

      CREATE TABLE timer_sessions (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL CHECK (kind IN ('focus', 'break')),
        pomodoro INTEGER NOT NULL CHECK (pomodoro IN (0, 1)),
        started_at INTEGER NOT NULL,
        ended_at INTEGER NOT NULL,
        planned_ms INTEGER NOT NULL,
        actual_ms INTEGER NOT NULL,
        completed INTEGER NOT NULL CHECK (completed IN (0, 1))
      ) STRICT;
      CREATE INDEX timer_sessions_by_end ON timer_sessions(ended_at);
    `)
  },
}
