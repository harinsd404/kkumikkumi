import { describe, expect, it } from 'vitest'
import { openDb } from '../connection'
import { FutureDbVersionError, getUserVersion, migrate, type Migration } from '../migrate'
import { migrations } from '../migrations'

const tables = (db: ReturnType<typeof openDb>) =>
  (
    db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all() as {
      name: string
    }[]
  ).map((r) => r.name)

describe('migrate', () => {
  it('빈 DB를 최신 버전까지 올린다', () => {
    const db = openDb(':memory:')
    expect(migrate(db, migrations)).toEqual({ from: 0, to: migrations.length })
    expect(getUserVersion(db)).toBe(migrations.length)
    expect(tables(db)).toEqual([
      'calendar_events',
      'settings',
      'theme_rules',
      'timer_state',
      'todo_items',
      'todo_lists',
    ])
  })

  it('002: v1 DB의 기존 할 일은 빈 메모로 남는다', () => {
    const db = openDb(':memory:')
    migrate(db, migrations.slice(0, 1))
    db.exec(`INSERT INTO todo_lists VALUES ('l', '목록', 0, 1, 1)`)
    db.exec(`INSERT INTO todo_items (id, list_id, title, done, completed_at, due_date, ord, created_at, updated_at)
             VALUES ('i', 'l', '할 일', 0, NULL, NULL, 0, 1, 1)`)
    expect(migrate(db, migrations)).toEqual({ from: 1, to: migrations.length })
    expect(db.prepare('SELECT title, note FROM todo_items').get()).toEqual({
      title: '할 일',
      note: '',
    })
  })

  it('두 번 실행해도 아무것도 하지 않는다', () => {
    const db = openDb(':memory:')
    migrate(db, migrations)
    expect(migrate(db, migrations)).toEqual({ from: migrations.length, to: migrations.length })
  })

  it('실패한 버전은 롤백되고 user_version은 이전 값으로 남는다', () => {
    const db = openDb(':memory:')
    const bad: Migration[] = [
      { version: 1, name: 'ok', up: (d) => d.exec('CREATE TABLE a (x INTEGER) STRICT') },
      {
        version: 2,
        name: 'boom',
        up: (d) => {
          d.exec('CREATE TABLE b (x INTEGER) STRICT')
          throw new Error('boom')
        },
      },
    ]
    expect(() => migrate(db, bad)).toThrow('boom')
    expect(getUserVersion(db)).toBe(1)
    expect(tables(db)).toEqual(['a'])
  })

  it('앱보다 새로운 DB는 거부한다', () => {
    const db = openDb(':memory:')
    db.exec('PRAGMA user_version = 99')
    expect(() => migrate(db, migrations)).toThrow(FutureDbVersionError)
  })

  it('버전이 연속이 아니면 거부한다', () => {
    const db = openDb(':memory:')
    expect(() => migrate(db, [{ version: 2, name: 'x', up: () => {} }])).toThrow('연속')
  })
})
