import type { Migration } from '../migrate'

/** 습관(이름, 색, 하는 요일 비트)과 날짜별 체크. 습관을 지우면 체크도 지워진다. */
export const m009Habits: Migration = {
  version: 9,
  name: 'habits',
  up(db) {
    db.exec(`
      CREATE TABLE habits (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        color TEXT NOT NULL,
        days INTEGER NOT NULL CHECK (days BETWEEN 1 AND 127),
        ord INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      ) STRICT;
      CREATE TABLE habit_checks (
        habit_id TEXT NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
        date TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (habit_id, date)
      ) STRICT;
      CREATE INDEX habit_checks_date ON habit_checks(date);
    `)
  },
}
