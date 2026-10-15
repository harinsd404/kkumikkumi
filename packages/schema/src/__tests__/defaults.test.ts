import { describe, expect, it } from 'vitest'
import {
  BUILTIN_THEME_IDS,
  builtinPresetOf,
  createDefaultTheme,
  createTheme,
  presetLook,
  referencedAssetHashes,
  THEME_TEMPLATE_IDS,
} from '../defaults'
import { parseTheme } from '../theme'
import { H, U, baseTheme } from './fixtures'

const ids = { theme: U(1), blocks: [U(2), U(3), U(4)] } as const

describe('createDefaultTheme', () => {
  it('ThemeSchema를 통과한다', () => {
    const r = parseTheme(createDefaultTheme(ids, 1000))
    expect(r.success, r.success ? '' : JSON.stringify(r.error.issues)).toBe(true)
  })
  it('두 프리셋 모두 ThemeSchema를 통과한다', () => {
    for (const preset of ['pudding', 'cottonCandy'] as const) {
      expect(parseTheme(createDefaultTheme(ids, 0, undefined, preset)).success).toBe(true)
    }
  })
  it('에셋을 참조하지 않는다', () => {
    expect(referencedAssetHashes(createDefaultTheme(ids, 0)).size).toBe(0)
  })
})

describe('createTheme', () => {
  it('모든 템플릿 × 프리셋 색이 ThemeSchema를 통과한다(칸 안, 겹침 없음)', () => {
    for (const template of THEME_TEMPLATE_IDS) {
      for (const preset of ['pudding', 'cottonCandy'] as const) {
        let n = 10
        const t = createTheme({ theme: U(1), newId: () => U(n++) }, 5, {
          ...presetLook(preset),
          name: '새 테마',
          template,
        })
        const r = parseTheme(t)
        expect(r.success, `${template}: ${r.success ? '' : JSON.stringify(r.error.issues)}`).toBe(
          true,
        )
      }
    }
  })
  it('무늬 없음, 글꼴, 이름을 그대로 쓴다', () => {
    const t = createTheme({ theme: U(1), newId: () => U(2) }, 0, {
      ...presetLook('pudding'),
      background: { color: '#123456', pattern: null },
      fontId: 'galmuri11',
      name: '내 테마',
      template: 'blank',
    })
    expect(t.background).toEqual({ type: 'color', color: '#123456', pattern: null })
    expect(t.defaults.fontId).toBe('galmuri11')
    expect(t.name).toBe('내 테마')
    expect(t.blocks).toEqual([])
  })
})

describe('builtinPresetOf', () => {
  it('고정 ID만 기본 테마로 본다(대소문자 무시)', () => {
    expect(builtinPresetOf(BUILTIN_THEME_IDS.pudding)).toBe('pudding')
    expect(builtinPresetOf(BUILTIN_THEME_IDS.cottonCandy.toUpperCase())).toBe('cottonCandy')
    expect(builtinPresetOf(U(1))).toBeNull()
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
