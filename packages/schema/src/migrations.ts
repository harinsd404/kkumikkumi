import { SCHEMA_VERSION } from './theme'

/**
 * theme.json 마이그레이션 훅. 키 = 원본 schemaVersion, 값 = 다음 버전으로 올리는 순수 함수.
 * v1이 최신이라 지금은 비어 있다. 새 버전을 만들면 여기에 (이전 버전 → 다음 버전) 변환을 추가한다.
 */
export const THEME_MIGRATIONS: Readonly<
  Record<number, (raw: Record<string, unknown>) => Record<string, unknown>>
> = {}

export type UpgradeResult =
  | { ok: true; value: unknown; from: number }
  | {
      ok: false
      code: 'not_object' | 'no_version' | 'future_version' | 'no_migration'
      version?: number
    }

/** 검증 전에 원시 JSON을 최신 schemaVersion으로 올린다. 미래 버전은 거부. */
export function upgradeThemeRaw(raw: unknown): UpgradeResult {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw))
    return { ok: false, code: 'not_object' }
  let cur = raw as Record<string, unknown>
  const from = cur['schemaVersion']
  if (typeof from !== 'number' || !Number.isInteger(from) || from < 1)
    return { ok: false, code: 'no_version' }
  if (from > SCHEMA_VERSION) return { ok: false, code: 'future_version', version: from }
  for (let v = from; v < SCHEMA_VERSION; v++) {
    const step = THEME_MIGRATIONS[v]
    if (!step) return { ok: false, code: 'no_migration', version: v }
    cur = step(cur)
  }
  return { ok: true, value: cur, from }
}
