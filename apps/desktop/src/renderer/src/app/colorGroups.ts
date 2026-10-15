import type { Palette } from '@kkumikkumi/schema'
import type { ThemeSummary } from '../../../shared/api'
import { themeTones, TONE_ROWS } from '../board/timetable'
import { BUILTIN_COMBOS } from './keyPalette'

// 색 고르기 팔레트(순수 함수). 어디서 색을 고르든 같은 묶음을 보여 준다(2026-10-14 사용자 지시):
// 이 테마의 대표색 → 이 테마 강조·체크 색의 톤(한 줄씩) → 다른 테마들의 대표색 → 기본 색 조합.

export interface SwatchGroup {
  label: string
  colors: string[]
}

export interface ThemeColors {
  name: string
  palette: Palette
  bgColor: string | null
}

const representative = (t: ThemeColors): string[] => {
  const p = t.palette
  return [
    p.accent,
    p.check,
    p.text,
    p.subText,
    p.surface,
    p.control,
    ...(t.bgColor ? [t.bgColor] : []),
  ]
}

const uniq = (cs: readonly string[]) => [...new Set(cs.map((c) => c.toLowerCase()))]
const keyOf = (cs: readonly string[]) => [...uniq(cs)].sort().join()

/** 지금 테마 말고 저장된 테마들(기본 테마는 항상 저장되어 있다) */
export function otherThemes(summaries: readonly ThemeSummary[], currentId: string): ThemeColors[] {
  return summaries.flatMap((s) =>
    s.ok && s.id !== currentId ? [{ name: s.name, palette: s.palette, bgColor: s.bgColor }] : [],
  )
}

/** 색이 똑같은 테마는 한 번만(지금 테마와 같은 색인 테마는 빼고) */
export function colorGroups(current: ThemeColors, others: readonly ThemeColors[]): SwatchGroup[] {
  const tones = themeTones(current.palette)
  const groups: SwatchGroup[] = [
    { label: '이 테마', colors: uniq([...representative(current), '#ffffff', '#000000']) },
    // 톤은 강조색 줄, 체크색 줄(옅은 → 진한)
    ...TONE_ROWS.map((row, k) => ({
      label: k === 0 ? '강조 톤' : '체크 톤',
      colors: uniq(row.map((i) => tones[i]!)),
    })),
  ]
  const seen = new Set([keyOf(representative(current))])
  const combos = BUILTIN_COMBOS.map((c) => ({
    name: c.name,
    palette: c.palette,
    bgColor: c.background.color,
  }))
  for (const t of [...others, ...combos]) {
    const colors = representative(t)
    const key = keyOf(colors)
    if (seen.has(key)) continue
    seen.add(key)
    groups.push({ label: t.name, colors: uniq(colors) })
  }
  return groups
}
