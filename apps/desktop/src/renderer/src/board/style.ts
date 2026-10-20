import type { CSSProperties } from 'react'
import type { FreeItem, GridBlock, Palette, Theme } from '@kkumikkumi/schema'
import { fontStack } from './fonts'

type Style = GridBlock['style']
type Decor = FreeItem['decor']
type ImageContent = Extract<GridBlock, { type: 'image' }>['props']

// 구조화된 스타일 값 → CSS. 원시 CSS 문자열은 받지 않는다(모든 값은 ThemeSchema로 검증된 것).

export const SHADOWS: Record<Style['shadow'], string> = {
  none: 'none',
  soft: '0 2px 10px rgba(0, 0, 0, 0.08)',
  medium: '0 6px 20px rgba(0, 0, 0, 0.12)',
  strong: '0 12px 32px rgba(0, 0, 0, 0.18)',
}

const border = (b: Style['border'], palette: Palette) =>
  b.width > 0 ? `${b.width}px solid ${b.color ?? palette.accent}` : 'none'

/** 자유 아이템 장식(배경/폰트 없음) */
export function decorCss(d: Decor, palette: Palette): CSSProperties {
  return {
    opacity: d.opacity,
    borderRadius: d.radius,
    border: border(d.border, palette),
    boxShadow: SHADOWS[d.shadow],
  }
}

/** 그리드 블록 카드 */
export function cardCss(s: Style, defaults: Theme['defaults']): CSSProperties {
  return {
    ...decorCss(s, defaults.palette),
    background: s.bg ?? 'transparent',
    color: s.textColor ?? defaults.palette.text,
    fontFamily: fontStack(s.fontId ?? defaults.fontId),
  }
}

/** 이미지 콘텐츠: fit + focus(object-position) + zoom(focus 기준 확대) + shape */
export function imageCss(c: ImageContent): { frame: CSSProperties; img: CSSProperties } {
  const pos = `${c.focus.x * 100}% ${c.focus.y * 100}%`
  return {
    frame: { overflow: 'hidden', ...(c.shape === 'circle' ? { borderRadius: '50%' } : {}) },
    img: {
      width: '100%',
      height: '100%',
      objectFit: c.fit,
      objectPosition: pos,
      transform: c.focus.zoom !== 1 ? `scale(${c.focus.zoom})` : undefined,
      transformOrigin: pos,
      display: 'block',
    },
  }
}

/** 블록 안 CSS에서 쓰는 팔레트 변수(--kb-accent / --kb-check / --kb-sub) */
/** 블록이 쓰는 팔레트: 인스펙터 "글자색"(style.textColor)을 정하면 글자색만 그 색으로 */
export function blockPalette(theme: Theme, block: GridBlock): Palette {
  const p = theme.defaults.palette
  return block.style.textColor ? { ...p, text: block.style.textColor } : p
}

export function paletteVars(p: Palette): CSSProperties {
  return {
    '--kb-accent': p.accent,
    '--kb-check': p.check,
    '--kb-sub': p.subText,
  } as CSSProperties
}

/** 단색 SVG를 마스크로 쓰고 color로 칠한다 */
export function maskCss(url: string, color: string): CSSProperties {
  return {
    backgroundColor: color,
    maskImage: `url("${url}")`,
    maskSize: '100% 100%',
    maskRepeat: 'no-repeat',
    WebkitMaskImage: `url("${url}")`,
    WebkitMaskSize: '100% 100%',
    WebkitMaskRepeat: 'no-repeat',
  }
}
