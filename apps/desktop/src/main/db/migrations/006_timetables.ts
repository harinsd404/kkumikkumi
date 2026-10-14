import { randomUUID } from 'node:crypto'
import { DEFAULT_TIMETABLE, TimetableSettingsSchema } from '@kkumikkumi/schema'
import type { Migration } from '../migrate'

/**
 * 시간표 여러 개. 설정(방식·주말·교시 시각)은 시간표마다 timetables.settings(JSON)에 둔다.
 * 칸 색은 자유 색(color) 대신 테마 색 톤 번호(tone)로 바꾼다. 기존 직접 색은 자동(NULL)이 된다.
 * 기존 설정(settings 'timetable')과 항목은 "내 시간표" 하나로 옮기고, 전역 설정은 'timetablePrefs'(고른 시간표)로 바꾼다.
 */
export const m006Timetables: Migration = {
  version: 6,
  name: 'timetables',
  up(db) {
    db.exec(`
      CREATE TABLE timetables (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        settings TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      ) STRICT;
    `)

    const old = db.prepare("SELECT value FROM settings WHERE key = 'timetable'").get() as
      { value: string } | undefined
    let settings = DEFAULT_TIMETABLE
    if (old) {
      try {
        const p = TimetableSettingsSchema.safeParse(JSON.parse(old.value))
        if (p.success) settings = p.data
      } catch {
        // 손상된 설정은 기본값으로
      }
    }
    const id = randomUUID()
    const now = Date.now()
    db.prepare(
      'INSERT INTO timetables (id, name, settings, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    ).run(id, '내 시간표', JSON.stringify(settings), now, now)

    db.exec(`
      CREATE TABLE timetable_entries_new (
        id TEXT PRIMARY KEY,
        timetable_id TEXT NOT NULL REFERENCES timetables(id) ON DELETE CASCADE,
        kind TEXT NOT NULL CHECK (kind IN ('period', 'time')),
        day INTEGER NOT NULL CHECK (day BETWEEN 0 AND 6),
        period INTEGER,
        start_time TEXT,
        end_time TEXT,
        subject TEXT NOT NULL,
        room TEXT NOT NULL,
        tone INTEGER CHECK (tone BETWEEN 0 AND 11),
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      ) STRICT;
    `)
    db.prepare(
      `INSERT INTO timetable_entries_new
         SELECT id, ?, kind, day, period, start_time, end_time, subject, room, NULL, created_at, updated_at
         FROM timetable_entries`,
    ).run(id)
    db.exec(`
      DROP TABLE timetable_entries;
      ALTER TABLE timetable_entries_new RENAME TO timetable_entries;
      CREATE UNIQUE INDEX timetable_period_cell
        ON timetable_entries(timetable_id, day, period) WHERE kind = 'period';
      CREATE INDEX timetable_entries_owner ON timetable_entries(timetable_id);
      DELETE FROM settings WHERE key = 'timetable';
    `)
    db.prepare("INSERT INTO settings (key, value) VALUES ('timetablePrefs', ?)").run(
      JSON.stringify({ activeId: id }),
    )
  },
}
