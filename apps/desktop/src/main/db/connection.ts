import { DatabaseSync } from 'node:sqlite'

// node:sqlite는 Node 24에서 Stability 1.2(RC)다. 교체 가능성을 위해 앱 코드는 이 모듈의 Db 타입만 사용한다.
export type Db = DatabaseSync

export function openDb(path: string): Db {
  const db = new DatabaseSync(path, {
    enableForeignKeyConstraints: true,
    enableDoubleQuotedStringLiterals: false,
    defensive: true,
    timeout: 2000,
  })
  if (path !== ':memory:') db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA synchronous = NORMAL')
  return db
}

/** fn을 하나의 트랜잭션으로 실행한다. 이미 트랜잭션 안이면 그대로 실행(중첩 없음). */
export function transaction<T>(db: Db, fn: () => T): T {
  if (db.isTransaction) return fn()
  db.exec('BEGIN IMMEDIATE')
  try {
    const result = fn()
    db.exec('COMMIT')
    return result
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
}
