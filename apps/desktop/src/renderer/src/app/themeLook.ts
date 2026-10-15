import {
  createTheme,
  type Palette,
  type Theme,
  type ThemeLook,
  type ThemeTemplateId,
} from '@kkumikkumi/schema'
import type { ThemeSummary } from '../../../shared/api'

// 테마 만들기/수정 창에서 쓰는 순수 함수: 테마의 외형(색·배경·글꼴)을 꺼내고 되돌려 넣는다.

/** 창에서 고치는 색 칸. 앞의 넷은 늘 보이고 나머지는 "더 보기" */
export type LookColorKey = 'bg' | 'pattern' | keyof Palette

export const LOOK_COLORS: readonly { key: LookColorKey; label: string; more?: true }[] = [
  { key: 'bg', label: '배경' },
  { key: 'accent', label: '강조' },
  { key: 'check', label: '체크' },
  { key: 'text', label: '글자' },
  { key: 'subText', label: '보조 글자', more: true },
  { key: 'surface', label: '바탕 칸', more: true },
  { key: 'control', label: '버튼', more: true },
]

/** 이미지 배경이면 색 배경은 바탕 칸 색으로 시작한다(이미지 배경은 수정 창에서 바꾸지 않음) */
export function lookOf(t: Theme): ThemeLook {
  const bg = t.background
  return {
    palette: { ...t.defaults.palette },
    background:
      bg.type === 'color'
        ? { color: bg.color, pattern: bg.pattern ? { ...bg.pattern } : null }
        : { color: t.defaults.palette.surface, pattern: null },
    fontId: t.defaults.fontId,
  }
}

export function lookOfSummary(s: Extract<ThemeSummary, { ok: true }>): ThemeLook {
  return {
    palette: { ...s.palette },
    background: {
      color: s.bgColor ?? s.palette.surface,
      pattern: s.pattern ? { ...s.pattern } : null,
    },
    fontId: s.fontId,
  }
}

/** 외형만 바꾼 테마. 이미지 배경은 그대로 둔다. */
export function applyLook(t: Theme, look: ThemeLook, name?: string): Theme {
  return {
    ...t,
    ...(name !== undefined ? { name } : {}),
    defaults: { fontId: look.fontId, palette: { ...look.palette } },
    background:
      t.background.type === 'color'
        ? {
            type: 'color',
            color: look.background.color,
            pattern: look.background.pattern ? { ...look.background.pattern } : null,
          }
        : t.background,
  }
}

export function colorOf(look: ThemeLook, key: LookColorKey): string | null {
  if (key === 'bg') return look.background.color
  if (key === 'pattern') return look.background.pattern?.color ?? null
  return look.palette[key]
}

export function withColor(look: ThemeLook, key: LookColorKey, color: string): ThemeLook {
  if (key === 'bg') return { ...look, background: { ...look.background, color } }
  if (key === 'pattern') {
    const p = look.background.pattern
    return p ? { ...look, background: { ...look.background, pattern: { ...p, color } } } : look
  }
  return { ...look, palette: { ...look.palette, [key]: color } }
}

/** 시작 색 가져오기: 색과 무늬만(글꼴은 그대로) */
export const withColorsFrom = (look: ThemeLook, from: ThemeLook): ThemeLook => ({
  ...look,
  palette: { ...from.palette },
  background: {
    color: from.background.color,
    pattern: from.background.pattern ? { ...from.background.pattern } : null,
  },
})

/** 색과 무늬가 똑같은 테마는 처음 것만(색 가져오기 목록) */
export function uniqueLooks<T extends { look: ThemeLook }>(items: readonly T[]): T[] {
  const seen = new Set<string>()
  return items.filter((it) => {
    const key = JSON.stringify([it.look.palette, it.look.background])
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

const PREVIEW_ID = '00000000-0000-4000-8000-000000000000'

/** 새 테마 미리보기용 테마(저장하지 않는다) */
export function previewTheme(look: ThemeLook, template: ThemeTemplateId, name: string): Theme {
  let n = 0
  return createTheme(
    { theme: PREVIEW_ID, newId: () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}` },
    0,
    { ...look, name, template },
  )
}
