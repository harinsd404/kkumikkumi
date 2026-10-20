import type { Migration } from '../migrate'

/**
 * 스프린트(기간 동안 끝낼 일 묶음). 할 일은 스프린트에 속할 수 있다(sprint_id, 없으면 NULL).
 * 스프린트를 지우면 할 일은 남고 연결만 끊긴다(ON DELETE SET NULL).
 */
export const m007Sprints: Migration = {
  version: 7,
  name: 'sprints',
  up(db) {
    db.exec(`
      CREATE TABLE sprints (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        goal TEXT NOT NULL DEFAULT '',
        start_date TEXT NOT NULL,
        end_date TEXT NOT NULL,
        color TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        CHECK (start_date <= end_date)
      ) STRICT;
      ALTER TABLE todo_items ADD COLUMN sprint_id TEXT REFERENCES sprints(id) ON DELETE SET NULL;
      CREATE INDEX todo_items_sprint ON todo_items(sprint_id);
    `)
  },
}
