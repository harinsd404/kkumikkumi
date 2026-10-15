import type { z } from 'zod'
import type { Db } from '../connection'
import type { Row } from './rows'

export interface KvSetting<T> {
  /** 없으면 undefined. 손상됐으면 예외(JSON/스키마 오류) */
  read(): T | undefined
  /** 없거나 손상됐으면 fallback */
  readOr<F>(fallback: F): T | F
  /** 검증한 값을 저장하고 돌려준다 */
  save(value: T): T
}

/** settings 테이블의 키 하나. 값은 JSON 한 행으로 저장하고 읽고 쓸 때 schema로 검증한다. */
export function kvSetting<T>(db: Db, key: string, schema: z.ZodType<T>): KvSetting<T> {
  const raw = (): string | undefined => {
    const r = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as Row | undefined
    return r ? String(r['value']) : undefined
  }
  return {
    read() {
      const v = raw()
      return v === undefined ? undefined : schema.parse(JSON.parse(v))
    },
    readOr(fallback) {
      const v = raw()
      if (v === undefined) return fallback
      const p = schema.safeParse(safeJson(v))
      return p.success ? p.data : fallback
    },
    save(value) {
      const s = schema.parse(value)
      db.prepare(
        'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      ).run(key, JSON.stringify(s))
      return s
    },
  }
}

const safeJson = (s: string): unknown => {
  try {
    return JSON.parse(s)
  } catch {
    return null
  }
}
