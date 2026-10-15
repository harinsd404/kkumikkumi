import { createDefaultTheme, parseTheme, presetLook, THEME_PRESETS } from '@kkumikkumi/schema'
import { describe, expect, it } from 'vitest'
import {
  applyLook,
  colorOf,
  lookOf,
  previewTheme,
  withColor,
  withColorsFrom,
  uniqueLooks,
} from '../themeLook'

const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const base = () => createDefaultTheme({ theme: U(1), blocks: [U(2), U(3), U(4)] }, 0)

describe('themeLook', () => {
  it('lookOf → applyLook 왕복은 테마를 바꾸지 않는다', () => {
    const t = base()
    expect(applyLook(t, lookOf(t))).toEqual(t)
  })

  it('applyLook: 색·무늬·글꼴·이름만 바꾸고 배치는 그대로', () => {
    const t = base()
    const look = { ...presetLook('cottonCandy'), fontId: 'galmuri11' }
    const r = applyLook(t, look, '새 이름')
    expect(r.name).toBe('새 이름')
    expect(r.defaults).toEqual({ fontId: 'galmuri11', palette: THEME_PRESETS.cottonCandy.palette })
    expect(r.background).toEqual({
      type: 'color',
      color: '#daecf6',
      pattern: { id: 'stars', color: '#fffae7' },
    })
    expect(r.blocks).toEqual(t.blocks)
    expect(parseTheme(r).success).toBe(true)
  })

  it('applyLook: 이미지 배경은 그대로 둔다', () => {
    const t = {
      ...base(),
      background: { type: 'image' as const, assetHash: 'a'.repeat(64), fit: 'cover' as const },
    }
    expect(applyLook(t, presetLook('cottonCandy')).background).toEqual(t.background)
  })

  it('withColor / colorOf: 배경, 무늬(무늬 없으면 그대로), 팔레트', () => {
    let look = presetLook('pudding')
    look = withColor(look, 'bg', '#111111')
    look = withColor(look, 'pattern', '#222222')
    look = withColor(look, 'accent', '#333333')
    expect([colorOf(look, 'bg'), colorOf(look, 'pattern'), colorOf(look, 'accent')]).toEqual([
      '#111111',
      '#222222',
      '#333333',
    ])
    const plain = { ...look, background: { color: '#111111', pattern: null } }
    expect(withColor(plain, 'pattern', '#444444')).toEqual(plain)
    expect(colorOf(plain, 'pattern')).toBeNull()
  })

  it('withColorsFrom: 색과 무늬만 가져오고 글꼴은 유지', () => {
    const mine = { ...presetLook('pudding'), fontId: 'galmuri11' }
    const r = withColorsFrom(mine, presetLook('cottonCandy'))
    expect(r.fontId).toBe('galmuri11')
    expect(r.palette).toEqual(THEME_PRESETS.cottonCandy.palette)
  })

  it('uniqueLooks: 색·무늬가 같으면 처음 것만(글꼴은 무시)', () => {
    const a = { name: 'a', look: presetLook('pudding') }
    const b = { name: 'b', look: { ...presetLook('pudding'), fontId: 'galmuri11' } }
    const c = { name: 'c', look: presetLook('cottonCandy') }
    expect(uniqueLooks([a, b, c]).map((x) => x.name)).toEqual(['a', 'c'])
  })

  it('previewTheme: 템플릿마다 유효한 테마', () => {
    for (const tpl of ['classic', 'photoCalendar', 'study', 'blank'] as const)
      expect(parseTheme(previewTheme(presetLook('pudding'), tpl, '미리보기')).success).toBe(true)
  })
})
