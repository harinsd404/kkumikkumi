import { LookColorsSchema } from '@kkumikkumi/schema'
import { describe, expect, it } from 'vitest'
import { contrastRatio } from '../../board/colors'
import {
  BUILTIN_COMBOS,
  keysOf,
  lookColorsFromKeys,
  SUB_TEXT_CONTRAST,
  TEXT_CONTRAST,
} from '../keyPalette'

const readable = (c: {
  palette: { text: string; subText: string; surface: string }
  background: { color: string }
}) => {
  for (const back of ['#ffffff', c.background.color, c.palette.surface]) {
    expect(contrastRatio(c.palette.text, back)).toBeGreaterThanOrEqual(TEXT_CONTRAST)
    expect(contrastRatio(c.palette.subText, back)).toBeGreaterThanOrEqual(SUB_TEXT_CONTRAST)
  }
}

describe('lookColorsFromKeys', () => {
  it('강조·체크만 골라도 나머지 칸을 채우고, 고른 색은 그대로', () => {
    const c = lookColorsFromKeys({ accent: '#3a7bd5', check: '#ffd166' }, 'dots')
    expect(LookColorsSchema.safeParse(c).success).toBe(true)
    expect(c.palette).toMatchObject({ accent: '#3a7bd5', check: '#ffd166' })
    expect(c.background.pattern?.id).toBe('dots')
    readable(c)
  })
  it('배경·버튼·무늬를 고르면 그 색, 무늬 없음이면 null', () => {
    const c = lookColorsFromKeys(
      {
        accent: '#3a7bd5',
        check: '#ffd166',
        bg: '#101820',
        control: '#eeeeee',
        pattern: '#123456',
      },
      null,
    )
    expect(c.background).toEqual({ color: '#101820', pattern: null })
    expect(c.palette.control).toBe('#eeeeee')
  })
  it('keysOf → lookColorsFromKeys는 고른 칸을 되살린다', () => {
    const c = BUILTIN_COMBOS[2]!
    const again = lookColorsFromKeys(keysOf(c), 'dots')
    expect(again.background).toEqual(c.background)
    expect(again.palette.accent).toBe(c.palette.accent)
  })
})

describe('기본 색 조합', () => {
  it.each(BUILTIN_COMBOS.map((c) => [c.name, c] as const))(
    '%s: 지정한 원색을 그대로 쓰고 글자는 읽힌다',
    (_, c) => {
      expect(
        LookColorsSchema.safeParse({ palette: c.palette, background: c.background }).success,
      ).toBe(true)
      const used = [
        ...Object.values(c.palette),
        c.background.color,
        c.background.pattern?.color ?? '',
      ].map((x) => x.toLowerCase())
      for (const s of c.source) expect(used).toContain(s)
      readable(c)
    },
  )
})
