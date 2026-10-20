import type { Migration } from '../migrate'

/** 일기: 날짜마다 하나(글, 기분 1~5, 사진 목록 JSON). 사진 파일은 userData/diary/에 따로 둔다. */
export const m008Diary: Migration = {
  version: 8,
  name: 'diary',
  up(db) {
    db.exec(`
      CREATE TABLE diary_entries (
        date TEXT PRIMARY KEY,
        body TEXT NOT NULL DEFAULT '',
        mood INTEGER CHECK (mood BETWEEN 1 AND 5),
        photos TEXT NOT NULL DEFAULT '[]',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      ) STRICT;
    `)
  },
}
