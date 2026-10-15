import { THEME_PRESETS } from '@kkumikkumi/schema'
import { describe, expect, it } from 'vitest'
import type { ThemeSummary } from '../../../../shared/api'
import { colorGroups, otherThemes, type ThemeColors } from '../colorGroups'

const pudding: ThemeColors = {
  name: '푸딩 아침',
  palette: THEME_PRESETS.pudding.palette,
  bgColor: THEME_PRESETS.pudding.background.color,
}
const cotton: ThemeColors = {
  name: '코튼캔디',
  palette: THEME_PRESETS.cottonCandy.palette,
  bgColor: THEME_PRESETS.cottonCandy.background.color,
}
const summary = (id: string, name: string, t: ThemeColors): ThemeSummary => ({
  id,
  ok: true,
  name,
  updatedAt: 0,
  builtin: false,
  palette: t.palette,
  bgColor: t.bgColor,
  pattern: null,
  fontId: 'pretendard',
})

describe('colorGroups', () => {
  it('이 테마 대표색 → 톤 → 다른 테마 순', () => {
    const g = colorGroups(pudding, otherThemes([summary('c', '코튼캔디', cotton)], 'x'))
    expect(g.map((x) => x.label)).toEqual(['이 테마', '강조 톤', '체크 톤', '코튼캔디'])
    expect(g[0]!.colors).toContain('#d9b48a')
    expect(g[0]!.colors).toContain('#fffae7') // 배경색
    expect(g[0]!.colors.slice(-2)).toEqual(['#ffffff', '#000000'])
    expect(g[1]!.colors).toHaveLength(6)
    expect(g[2]!.colors).toHaveLength(6)
    expect(g[3]!.colors).toContain('#f4c2df')
  })

  it('색이 같은 테마는 한 번만, 지금 테마와 같은 색 테마는 뺀다', () => {
    const list: ThemeSummary[] = [
      summary('a', '내 푸딩', pudding), // 지금 테마와 색이 같음
      summary('b', '솜사탕', cotton),
      { id: 'c', ok: false, error: 'invalid_json' },
    ]
    const g = colorGroups(pudding, otherThemes(list, 'cur'))
    expect(g.map((x) => x.label)).toEqual(['이 테마', '강조 톤', '체크 톤', '솜사탕'])
    // 같은 색 테마는 처음 것만
    const twice = colorGroups(pudding, otherThemes([...list, summary('d', '코튼', cotton)], 'cur'))
    expect(twice.map((x) => x.label)).toEqual(['이 테마', '강조 톤', '체크 톤', '솜사탕'])
  })

  it('otherThemes: 지금 테마와 읽을 수 없는 테마는 뺀다', () => {
    const list: ThemeSummary[] = [
      summary('cur', '지금', pudding),
      summary('b', '다른', cotton),
      { id: 'x', ok: false, error: 'invalid_json' },
    ]
    expect(otherThemes(list, 'cur').map((t) => t.name)).toEqual(['다른'])
  })

  it('색은 소문자로, 한 묶음 안에서 겹치지 않게', () => {
    const t: ThemeColors = {
      name: 'x',
      palette: { ...pudding.palette, control: '#D9B48A' },
      bgColor: null,
    }
    const first = colorGroups(t, [])[0]!.colors
    expect(first.filter((c) => c === '#d9b48a')).toHaveLength(1)
  })
})
