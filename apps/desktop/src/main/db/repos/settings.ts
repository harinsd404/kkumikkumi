import { SettingsSchema, type Settings } from '@kkumikkumi/schema'
import type { Db } from '../connection'
import type { Row } from './rows'

const KEY = 'app'

/** 설정은 JSON 한 행으로 저장하고 읽을 때 SettingsSchema로 검증한다. */
export class SettingsRepo {
  constructor(private readonly db: Db) {}

  get(): Settings | null {
    const r = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(KEY) as
      Row | undefined
    return r ? SettingsSchema.parse(JSON.parse(String(r['value']))) : null
  }

  save(settings: Settings): Settings {
    const s = SettingsSchema.parse(settings)
    this.db
      .prepare(
        'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      )
      .run(KEY, JSON.stringify(s))
    return s
  }
}
