import { WindowStateSchema, type WindowState } from '@kkumikkumi/schema'
import type { Db } from '../connection'
import type { Row } from './rows'

/** 창 크기/위치. settings 테이블의 별도 키에 JSON으로 저장. 손상되면 null(기본값 사용). */
export class WindowStateRepo {
  /** key: 'window'(보드 창) / 'miniWindow'(미니 타이머 창) */
  constructor(
    private readonly db: Db,
    private readonly key = 'window',
  ) {}

  get(): WindowState | null {
    const r = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(this.key) as
      Row | undefined
    if (!r) return null
    try {
      return WindowStateSchema.parse(JSON.parse(String(r['value'])))
    } catch {
      return null
    }
  }

  save(state: WindowState): void {
    const s = WindowStateSchema.parse(state)
    this.db
      .prepare(
        'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      )
      .run(this.key, JSON.stringify(s))
  }
}
