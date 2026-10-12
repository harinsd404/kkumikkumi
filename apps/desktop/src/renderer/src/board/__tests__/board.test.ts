import type { GridBlock, Palette, Theme } from '@kkumikkumi/schema'
import { describe, expect, it } from 'vitest'
import { makeAssetUrl } from '../../app/assetUrl'
import { monthGrid, shiftMonth, weekdayLabels, weekOf } from '../calendar'
import { DEFAULT_FONT_ID, fontStack, resolveFontId } from '../fonts'
import { BOARD_GAP, BOARD_PADDING, blockBox, fitScale } from '../layout'
import { patternRows } from '../pattern'
import { cardCss, decorCss, imageCss, SHADOWS } from '../style'

const palette: Palette = {
  text: '#111111',
  subText: '#222222',
  accent: '#333333',
  check: '#444444',
  surface: '#555555',
  control: '#666666',
}

describe('layout', () => {
  it('첫 칸은 바깥 여백만큼 떨어지고, 전체 폭 블록은 양쪽 여백을 남긴다', () => {
    expect(blockBox({ col: 0, row: 0, w: 1, h: 1 })).toMatchObject({
      left: BOARD_PADDING,
      top: BOARD_PADDING,
    })
    const full = blockBox({ col: 0, row: 0, w: 8, h: 5 })
    expect(full.left + full.width).toBeCloseTo(1600 - BOARD_PADDING)
    expect(full.top + full.height).toBeCloseTo(1000 - BOARD_PADDING)
  })
  it('이웃 블록 사이 간격은 BOARD_GAP', () => {
    const a = blockBox({ col: 0, row: 1, w: 4, h: 3 })
    const b = blockBox({ col: 4, row: 1, w: 2, h: 3 })
    expect(b.left - (a.left + a.width)).toBeCloseTo(BOARD_GAP)
  })
  it('fitScale: 16:10 창은 꽉 차고, 다른 비율은 가운데 정렬', () => {
    expect(fitScale(1280, 800)).toEqual({ scale: 0.8, offsetX: 0, offsetY: 0 })
    const wide = fitScale(2000, 1000)
    expect(wide.scale).toBe(1)
    expect(wide.offsetX).toBe(200)
    expect(fitScale(0, 0).scale).toBe(0)
  })
})

describe('calendar', () => {
  it('2026년 10월(일요일 시작)은 9/27부터 5주', () => {
    const g = monthGrid(2026, 9, 0)
    expect(g).toHaveLength(5)
    expect(g[0]![0]).toEqual({ date: '2026-09-27', day: 27, inMonth: false })
    expect(g[4]![6]).toEqual({ date: '2026-10-31', day: 31, inMonth: true })
  })
  it('월요일 시작이면 첫 칸이 월요일', () => {
    expect(monthGrid(2026, 9, 1)[0]![0]!.date).toBe('2026-09-28')
  })
  it('2026년 2월(일요일 시작)은 정확히 4주, 2026년 8월은 6주', () => {
    expect(monthGrid(2026, 1, 0)).toHaveLength(4)
    expect(monthGrid(2026, 7, 0)).toHaveLength(6)
  })
  it('윤년 2월 29일', () => {
    expect(
      monthGrid(2028, 1, 0)
        .flat()
        .filter((c) => c.inMonth),
    ).toHaveLength(29)
  })
  it('요일 라벨과 주, 달 이동(연도 넘김)', () => {
    expect(weekdayLabels(1)).toEqual(['월', '화', '수', '목', '금', '토', '일'])
    expect(weekOf(2026, 9, 12, 0).map((c) => c.day)).toEqual([11, 12, 13, 14, 15, 16, 17])
    expect(shiftMonth(2026, 11, 1)).toEqual({ year: 2027, month0: 0 })
    expect(shiftMonth(2026, 0, -1)).toEqual({ year: 2025, month0: 11 })
  })
})

describe('pattern', () => {
  it('줄 14개, 묶음마다 두 번째 줄은 오른쪽/아래로 어긋난다', () => {
    const rows = patternRows('stars')
    expect(rows).toHaveLength(14)
    expect(rows[1]!.x - rows[0]!.x).toBeCloseTo(50)
    expect(rows[1]!.y - rows[0]!.y).toBeCloseTo(85)
    expect(rows.every((r) => r.variant === 'normal')).toBe(true)
  })
  it('dots는 첫 줄만 first 변형', () => {
    expect(
      patternRows('dots')
        .map((r) => r.variant)
        .filter((v) => v === 'first'),
    ).toHaveLength(1)
  })
})

describe('style', () => {
  const style: GridBlock['style'] = {
    opacity: 0.9,
    radius: 25,
    border: { width: 2.5, color: null },
    shadow: 'soft',
    bg: null,
    fontId: null,
    textColor: null,
  }
  const defaults: Theme['defaults'] = { fontId: 'galmuri11', palette }

  it('null 값은 팔레트/테마 기본으로 대체', () => {
    const css = cardCss(style, defaults)
    expect(css).toMatchObject({
      opacity: 0.9,
      borderRadius: 25,
      border: '2.5px solid #333333',
      boxShadow: SHADOWS.soft,
      background: 'transparent',
      color: '#111111',
    })
    expect(css.fontFamily).toContain('Galmuri11')
  })
  it('지정한 값은 팔레트보다 우선', () => {
    const css = cardCss(
      { ...style, bg: '#ffffff', textColor: '#000000', border: { width: 1, color: '#ff0000' } },
      defaults,
    )
    expect(css).toMatchObject({
      background: '#ffffff',
      color: '#000000',
      border: '1px solid #ff0000',
    })
  })
  it('테두리 두께 0이면 none', () => {
    expect(decorCss({ ...style, border: { width: 0, color: '#ff0000' } }, palette).border).toBe(
      'none',
    )
  })
  it('imageCss: focus → object-position/transform-origin, zoom, circle', () => {
    const c = imageCss({
      assetHash: null,
      fit: 'contain',
      focus: { x: 0.25, y: 1, zoom: 2 },
      shape: 'circle',
    })
    expect(c.img).toMatchObject({
      objectFit: 'contain',
      objectPosition: '25% 100%',
      transform: 'scale(2)',
      transformOrigin: '25% 100%',
    })
    expect(c.frame.borderRadius).toBe('50%')
    expect(
      imageCss({ assetHash: null, fit: 'cover', focus: { x: 0.5, y: 0.5, zoom: 1 }, shape: 'rect' })
        .img.transform,
    ).toBeUndefined()
  })
})

describe('fonts', () => {
  it('모르는 fontId는 기본 폰트', () => {
    expect(resolveFontId('없는-폰트')).toBe(DEFAULT_FONT_ID)
    expect(resolveFontId('__proto__')).toBe(DEFAULT_FONT_ID)
    expect(fontStack('없는-폰트')).toMatch(/^"Pretendard"/)
    expect(fontStack('galmuri11')).toMatch(/^"Galmuri11"/)
  })
})

describe('makeAssetUrl', () => {
  it('매니페스트의 해시만 URL로, mime에 맞는 확장자', () => {
    const theme = {
      id: '00000000-0000-7000-8000-00000000000A',
      assets: [{ hash: 'a'.repeat(64), mime: 'image/jpeg', width: 1, height: 1, bytes: 1 }],
    } as unknown as Theme
    const url = makeAssetUrl(theme)
    expect(url('a'.repeat(64))).toBe(
      `kkumi-asset://00000000-0000-7000-8000-00000000000a/${'a'.repeat(64)}.jpg`,
    )
    expect(url('b'.repeat(64))).toBeNull()
  })
})
