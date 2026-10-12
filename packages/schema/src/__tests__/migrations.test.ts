import { describe, expect, it } from 'vitest'
import { upgradeThemeRaw } from '../migrations'

describe('upgradeThemeRaw', () => {
  it('최신 버전은 그대로 통과', () => {
    const raw = { schemaVersion: 1, x: 1 }
    expect(upgradeThemeRaw(raw)).toEqual({ ok: true, value: raw, from: 1 })
  })
  it('미래 버전 거부', () => {
    expect(upgradeThemeRaw({ schemaVersion: 2 })).toMatchObject({
      ok: false,
      code: 'future_version',
    })
  })
  it('버전 없음/객체 아님 거부', () => {
    expect(upgradeThemeRaw({})).toMatchObject({ ok: false, code: 'no_version' })
    expect(upgradeThemeRaw({ schemaVersion: 0 })).toMatchObject({ ok: false, code: 'no_version' })
    expect(upgradeThemeRaw([])).toMatchObject({ ok: false, code: 'not_object' })
    expect(upgradeThemeRaw(null)).toMatchObject({ ok: false, code: 'not_object' })
  })
})
