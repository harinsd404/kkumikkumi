import { describe, expect, it } from 'vitest'
import { createDefaultTheme, referencedAssetHashes } from '../defaults'
import { parseTheme } from '../theme'
import { H, U, baseTheme } from './fixtures'

const ids = { theme: U(1), blocks: [U(2), U(3), U(4), U(5), U(6)] } as const

describe('createDefaultTheme', () => {
  it('ThemeSchema를 통과한다', () => {
    const r = parseTheme(createDefaultTheme(ids, 1000))
    expect(r.success, r.success ? '' : JSON.stringify(r.error.issues)).toBe(true)
  })
  it('에셋을 참조하지 않는다', () => {
    expect(referencedAssetHashes(createDefaultTheme(ids, 0)).size).toBe(0)
  })
})

describe('referencedAssetHashes', () => {
  it('블록, 자유 아이템, 펫이 참조하는 해시를 모은다', () => {
    const parsed = parseTheme(baseTheme())
    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    expect([...referencedAssetHashes(parsed.data)].sort()).toEqual([H('a'), H('b'), H('c')])
  })
})
