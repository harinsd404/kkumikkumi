import type { Migration } from '../migrate'

export const m001Init: Migration = {
  version: 1,
  name: 'init',
  up(db) {
    db.exec(`
      CREATE TABLE todo_lists (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        ord INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      ) STRICT;

      CREATE TABLE todo_items (
        id TEXT PRIMARY KEY,
        list_id TEXT NOT NULL REFERENCES todo_lists(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        done INTEGER NOT NULL CHECK (done IN (0, 1)),
        completed_at INTEGER,
        due_date TEXT,
        ord INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      ) STRICT;
      CREATE INDEX todo_items_by_list ON todo_items(list_id, ord);
      CREATE INDEX todo_items_by_due ON todo_items(due_date) WHERE due_date IS NOT NULL;

      CREATE TABLE calendar_events (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        color TEXT NOT NULL,
        note TEXT NOT NULL,
        all_day INTEGER NOT NULL CHECK (all_day IN (0, 1)),
        start_utc INTEGER,
        end_utc INTEGER,
        tzid TEXT,
        start_date TEXT,
        end_date TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        CHECK (
          (all_day = 0 AND start_utc IS NOT NULL AND end_utc IS NOT NULL AND tzid IS NOT NULL
             AND start_date IS NULL AND end_date IS NULL)
          OR
          (all_day = 1 AND start_date IS NOT NULL AND end_date IS NOT NULL
             AND start_utc IS NULL AND end_utc IS NULL AND tzid IS NULL)
        )
      ) STRICT;
      CREATE INDEX calendar_events_by_utc ON calendar_events(start_utc) WHERE all_day = 0;
      CREATE INDEX calendar_events_by_date ON calendar_events(start_date) WHERE all_day = 1;

      CREATE TABLE timer_state (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        status TEXT NOT NULL,
        mode TEXT NOT NULL,
        duration_ms INTEGER NOT NULL,
        ends_at INTEGER,
        paused_remaining_ms INTEGER,
        updated_at INTEGER NOT NULL
      ) STRICT;

      CREATE TABLE theme_rules (
        id TEXT PRIMARY KEY,
        theme_id TEXT NOT NULL,
        enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
        priority INTEGER NOT NULL,
        conditions TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      ) STRICT;

      CREATE TABLE settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      ) STRICT;
    `)
  },
}
