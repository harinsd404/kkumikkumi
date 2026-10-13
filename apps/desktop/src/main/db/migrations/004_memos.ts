import type { Migration } from '../migrate'

/** 메모장. 본문은 원문 텍스트만 저장한다(HTML 없음). */
export const m004Memos: Migration = {
  version: 4,
  name: 'memos',
  up(db) {
    db.exec(`
      CREATE TABLE memos (
        id TEXT PRIMARY KEY,
        body TEXT NOT NULL,
        pinned INTEGER NOT NULL CHECK (pinned IN (0, 1)),
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      ) STRICT;
      CREATE INDEX memos_by_update ON memos(pinned DESC, updated_at DESC);
    `)
  },
}
