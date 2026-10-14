import type { SQLOutputValue } from 'node:sqlite'

export type Row = Record<string, SQLOutputValue>

/** SQLite 0/1 → boolean. 그 외 값은 스키마 검증에서 걸리도록 그대로 둔다. */
export const bool = (v: SQLOutputValue): unknown => (v === 0 ? false : v === 1 ? true : v)
export const int = (b: boolean): number => (b ? 1 : 0)

export class NotFoundError extends Error {
  constructor(readonly entity: string) {
    super(`${entity} 없음`)
    this.name = 'NotFoundError'
  }
}

/** 고유 제약 충돌(예: 이미 채워진 시간표 칸) */
export class ConflictError extends Error {
  constructor(readonly entity: string) {
    super(`${entity} 충돌`)
    this.name = 'ConflictError'
  }
}
