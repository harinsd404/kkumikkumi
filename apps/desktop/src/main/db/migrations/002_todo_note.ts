import type { Migration } from '../migrate'

/** 할 일 메모(세부 페이지). 기존 항목은 빈 문자열. */
export const m002TodoNote: Migration = {
  version: 2,
  name: 'todo_note',
  up(db) {
    db.exec(`ALTER TABLE todo_items ADD COLUMN note TEXT NOT NULL DEFAULT ''`)
  },
}
