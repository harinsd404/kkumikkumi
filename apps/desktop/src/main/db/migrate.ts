import { transaction, type Db } from './connection'

export interface Migration {
  readonly version: number
  readonly name: string
  up(db: Db): void
}

export class FutureDbVersionError extends Error {
  constructor(
    readonly dbVersion: number,
    readonly appVersion: number,
  ) {
    super(`DB user_version ${dbVersion} > 앱이 아는 최신 ${appVersion}`)
    this.name = 'FutureDbVersionError'
  }
}

export function getUserVersion(db: Db): number {
  const row = db.prepare('PRAGMA user_version').get() as { user_version: number } | undefined
  return row?.user_version ?? 0
}

/**
 * PRAGMA user_version 기반 마이그레이션 러너. 버전마다 한 트랜잭션으로 적용하고,
 * 실패하면 그 버전은 롤백되어 user_version도 이전 값으로 남는다.
 */
export function migrate(db: Db, migrations: readonly Migration[]): { from: number; to: number } {
  const sorted = [...migrations].sort((a, b) => a.version - b.version)
  sorted.forEach((m, i) => {
    if (m.version !== i + 1) throw new Error(`마이그레이션 버전이 1부터 연속이 아님: ${m.version}`)
  })
  const latest = sorted.length
  const from = getUserVersion(db)
  if (from > latest) throw new FutureDbVersionError(from, latest)

  for (const m of sorted.slice(from)) {
    transaction(db, () => {
      m.up(db)
      // PRAGMA는 바인딩 파라미터를 받지 않는다. version은 코드 상수(정수)라 안전하다.
      db.exec(`PRAGMA user_version = ${Math.trunc(m.version)}`)
    })
  }
  return { from, to: latest }
}
