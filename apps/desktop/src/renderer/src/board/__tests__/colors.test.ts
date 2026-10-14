import { THEME_PRESETS } from '@kkumikkumi/schema'
import { describe, expect, it } from 'vitest'
import { luminance, mixHex, uiControl } from '../colors'

describe('colors', () => {
  it('luminance: 검정 0, 흰색 1', () => {
    expect(luminance('#000000')).toBe(0)
    expect(luminance('#ffffff')).toBeCloseTo(1)
    expect(luminance('#ffffff80')).toBeCloseTo(1) // 알파는 무시
  })

  it('mixHex: 양 끝과 가운데', () => {
    expect(mixHex('#000000', '#ffffff', 0)).toBe('#000000')
    expect(mixHex('#000000', '#ffffff', 1)).toBe('#ffffff')
    expect(mixHex('#000000', '#ffffff', 0.5)).toBe('#808080')
  })

  it('uiControl: 충분히 진하면 그대로(푸딩 아침)', () => {
    const p = THEME_PRESETS.pudding.palette
    expect(uiControl(p)).toBe(p.control)
  })

  it('uiControl: 흰색에 가까우면 진한 쪽 색을 섞어 보이게(코튼캔디)', () => {
    const p = THEME_PRESETS.cottonCandy.palette
    const c = uiControl(p)
    expect(c).not.toBe(p.control)
    expect(luminance(c)).toBeLessThanOrEqual(0.88)
    expect(luminance(c)).toBeGreaterThan(0.8) // 너무 진해지지 않게
    // 강조(분홍)가 체크(하늘)보다 진해서 분홍 쪽으로 섞인다
    const [r, g] = [1, 3].map((i) => parseInt(c.slice(i, i + 2), 16))
    expect(r!).toBeGreaterThan(g!)
  })

  it('uiControl: 섞어도 안 되면 진한 색 그대로', () => {
    expect(uiControl({ control: '#ffffff', accent: '#fefefe', check: '#fdfdfd' })).toBe('#fdfdfd')
  })
})
