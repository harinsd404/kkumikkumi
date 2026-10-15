import type { LookColors, Pattern } from '@kkumikkumi/schema'
import { contrastRatio, hexToHsl, hslToHex, mixHex } from '../board/colors'

// 대표색 몇 개로 테마 색 전체(팔레트 7칸 + 무늬 색)를 만든다(순수 함수).
// 고른 대표색은 그대로 쓰고, 나머지 칸은 같은 계열의 옅은 톤과 진한 톤으로 채운다.
// 글자색은 흰 카드·배경·바탕 칸 위에서 읽히도록 명도만 낮춘다(접근성).

export interface KeyColors {
  accent: string
  check: string
  bg?: string | null
  control?: string | null
  pattern?: string | null
}

export type KeySlot = keyof KeyColors

/** 대표색 칸: 강조·체크는 꼭, 나머지는 고르면 그 색, 아니면 자동 */
export const KEY_SLOTS: readonly { key: KeySlot; label: string; optional?: true }[] = [
  { key: 'accent', label: '강조' },
  { key: 'check', label: '체크' },
  { key: 'bg', label: '배경', optional: true },
  { key: 'control', label: '버튼', optional: true },
  { key: 'pattern', label: '무늬', optional: true },
]

/** 글자(본문)와 보조 글자의 최소 명도 대비. 본문은 넉넉히(AAA), 보조 글자는 AA. */
export const TEXT_CONTRAST = 7
export const SUB_TEXT_CONTRAST = 4.5

const WHITE = '#ffffff'

/** base의 색상을 유지한 채 명도를 낮춰 가며, 모든 바탕 위에서 대비가 min 이상인 첫 색 */
function readableOn(
  base: string,
  backs: readonly { color: string; min: number }[],
  startL: number,
  maxSat: number,
): string {
  const [h, s] = hexToHsl(base)
  for (let l = startL; l > 0; l -= 0.01) {
    const c = hslToHex(h, Math.min(s, maxSat), l)
    if (backs.every((b) => contrastRatio(c, b.color) >= b.min)) return c
  }
  return '#000000'
}

/**
 * 대표색 → 테마 색. textBase가 있으면 글자색 계열을 그 색에서 가져온다(없으면 강조색).
 * 무늬가 없으면(patternId null) 무늬 색은 버린다.
 */
export function lookColorsFromKeys(
  k: KeyColors,
  patternId: Pattern['id'] | null,
  textBase?: string,
): LookColors {
  const bg = k.bg ?? mixHex(k.check, WHITE, 0.6)
  const surface = mixHex(bg, WHITE, 0.6)
  const control = k.control ?? mixHex(k.check, WHITE, 0.3)
  const base = textBase ?? k.accent
  const backs = [WHITE, bg, surface]
  const text = readableOn(
    base,
    [
      ...backs.map((color) => ({ color, min: TEXT_CONTRAST })),
      { color: control, min: SUB_TEXT_CONTRAST },
    ],
    0.35,
    0.35,
  )
  const subText = readableOn(
    base,
    backs.map((color) => ({ color, min: SUB_TEXT_CONTRAST })),
    0.5,
    0.3,
  )
  return {
    palette: { text, subText, accent: k.accent, check: k.check, surface, control },
    background: {
      color: bg,
      pattern: patternId ? { id: patternId, color: k.pattern ?? mixHex(k.accent, bg, 0.55) } : null,
    },
  }
}

/** 테마 색에서 대표색 칸 값 꺼내기(대표색으로 만들기를 열 때 지금 색에서 시작) */
export const keysOf = (c: LookColors): KeyColors => ({
  accent: c.palette.accent,
  check: c.palette.check,
  bg: c.background.color,
  control: c.palette.control,
  pattern: c.background.pattern?.color ?? null,
})

export interface BuiltinCombo extends LookColors {
  id: string
  name: string
  /** 사용자가 정한 원색(그대로 쓰였는지 테스트로 확인) */
  source: readonly string[]
}

/** 기본 색 조합(2026-10-15 사용자 지정 색. 접근성 때문에 글자색만 계산해 넣는다) */
export const BUILTIN_COMBOS: readonly BuiltinCombo[] = [
  {
    id: 'chocoForest',
    name: '초코나무숲',
    source: ['#d2e8c4', '#ac967f'],
    ...lookColorsFromKeys({ accent: '#ac967f', check: '#d2e8c4' }, 'dots'),
  },
  {
    id: 'tomato',
    name: '오늘의 토마토',
    source: ['#f1a597', '#d2e8c4'],
    ...lookColorsFromKeys(
      {
        accent: '#f1a597',
        check: '#d2e8c4',
        bg: mixHex('#f1a597', WHITE, 0.82),
        control: mixHex('#f1a597', WHITE, 0.55),
      },
      'stars',
    ),
  },
  {
    id: 'strawberryCake',
    name: '딸기케이크',
    source: ['#eab8c1', '#ce4e41', '#c79364', '#f2dedd'],
    ...lookColorsFromKeys(
      { accent: '#ce4e41', check: '#eab8c1', bg: '#f2dedd', pattern: '#c79364' },
      'dots',
      '#c79364',
    ),
  },
]
