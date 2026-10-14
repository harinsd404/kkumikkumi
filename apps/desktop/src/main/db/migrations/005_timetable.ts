import type { Migration } from '../migrate'

/** 시간표 항목. 교시 칸(period)과 시간 항목(start/end)을 한 테이블에 두고 kind로 나눈다. */
export const m005Timetable: Migration = {
  version: 5,
  name: 'timetable',
  up(db) {
    db.exec(`
      CREATE TABLE timetable_entries (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL CHECK (kind IN ('period', 'time')),
        day INTEGER NOT NULL CHECK (day BETWEEN 0 AND 6),
        period INTEGER,
        start_time TEXT,
        end_time TEXT,
        subject TEXT NOT NULL,
        room TEXT NOT NULL,
        color TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      ) STRICT;
      CREATE UNIQUE INDEX timetable_period_cell ON timetable_entries(day, period) WHERE kind = 'period';
    `)
  },
}
