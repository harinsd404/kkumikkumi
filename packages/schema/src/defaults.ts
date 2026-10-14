import { CANVAS, SCHEMA_VERSION, type Palette, type Pattern, type Theme } from './theme'

type Style = Theme['blocks'][number]['style']

/** 디자인 시안의 흰 카드 (1280px 시안 값 × 1.25 = 논리 캔버스 값) */
/** 블록 카드 기본 스타일. 외곽선은 모든 블록이 같다(2.5, 강조색) — 2026-10-14 사용자 지시 */
const cardStyle = (): Style => ({
  opacity: 1,
  radius: 25,
  border: { width: 2.5, color: null },
  shadow: 'none',
  bg: '#ffffff',
  fontId: null,
  textColor: null,
})

const bannerStyle = (): Style => ({ ...cardStyle(), radius: 15, bg: null })

export interface ThemePreset {
  name: string
  background: { color: string; pattern: Pattern }
  palette: Palette
}

/** 디자인 시안의 두 테마 (Figma 3:1079 푸딩 아침, 6:2384 코튼캔디). 이미지 에셋은 포함하지 않는다. */
export const THEME_PRESETS = {
  pudding: {
    name: '푸딩 아침',
    background: { color: '#fffae7', pattern: { id: 'dots', color: '#ded2be' } },
    palette: {
      text: '#4a3a36',
      subText: '#85705f',
      accent: '#d9b48a',
      check: '#f6ebb5',
      surface: '#fff8e4',
      control: '#fdefc9',
    },
  },
  cottonCandy: {
    name: '코튼캔디',
    background: { color: '#daecf6', pattern: { id: 'stars', color: '#fffae7' } },
    palette: {
      text: '#806e7a',
      subText: '#806e7a',
      accent: '#f4c2df',
      check: '#c4e0f0',
      surface: '#f2fafc',
      control: '#f2fafc',
    },
  },
} as const satisfies Record<string, ThemePreset>

export type ThemePresetId = keyof typeof THEME_PRESETS
export const THEME_PRESET_IDS = [
  'pudding',
  'cottonCandy',
] as const satisfies readonly ThemePresetId[]

export interface DefaultThemeIds {
  theme: string
  /** 블록 3개에 쓸 UUID (배너 이미지, 캘린더, 투두 순) */
  blocks: readonly [string, string, string]
}

/**
 * 기본 테마(디자인 시안 레이아웃): 배너 이미지 W(8x1), 캘린더 L(4x3), 투두 M(2x3).
 * 에셋 없이 동작하도록 이미지는 빈 플레이스홀더, 펫은 내장. ID와 시각은 주입받아 순수 함수로 유지한다.
 */
export function createDefaultTheme(
  ids: DefaultThemeIds,
  now: number,
  name?: string,
  preset: ThemePresetId = 'pudding',
): Theme {
  const p = THEME_PRESETS[preset]
  const [banner, cal, todo] = ids.blocks
  return {
    schemaVersion: SCHEMA_VERSION,
    id: ids.theme,
    name: name ?? p.name,
    createdAt: now,
    updatedAt: now,
    canvas: { ...CANVAS },
    defaults: { fontId: 'pretendard', palette: { ...p.palette } },
    background: { type: 'color', color: p.background.color, pattern: { ...p.background.pattern } },
    blocks: [
      {
        id: banner,
        type: 'image',
        size: 'W',
        col: 0,
        row: 0,
        style: bannerStyle(),
        props: { assetHash: null, fit: 'cover', focus: { x: 0.5, y: 0.5, zoom: 1 }, shape: 'rect' },
      },
      {
        id: cal,
        type: 'calendar',
        size: 'L',
        col: 0,
        row: 1,
        style: cardStyle(),
        props: { view: 'month', weekStartsOn: 0 },
      },
      {
        id: todo,
        type: 'todo',
        size: 'M',
        col: 4,
        row: 1,
        style: cardStyle(),
        props: { listId: null, showCompleted: true },
      },
    ],
    freeItems: [],
    pet: {
      name: '꾸이',
      size: 96,
      walk: true,
      speed: 'normal',
      source: { type: 'builtin', builtinId: 'default' },
    },
    assets: [],
  }
}

/** 테마에서 참조하는 모든 에셋 해시 (고아 에셋 정리, 내보내기용) */
export function referencedAssetHashes(t: Theme): Set<string> {
  const out = new Set<string>()
  const add = (h: string | null) => {
    if (h !== null) out.add(h)
  }
  if (t.background.type === 'image') add(t.background.assetHash)
  for (const b of t.blocks) if (b.type === 'image') add(b.props.assetHash)
  for (const f of t.freeItems) {
    if (f.kind === 'image') add(f.content.assetHash)
    else if (f.source.type === 'asset') add(f.source.hash)
  }
  if (t.pet.source.type === 'custom') {
    const { rest, music, typing } = t.pet.source.images
    add(rest)
    add(music)
    add(typing)
  }
  return out
}

/* ───────── 에디터에서 새로 만드는 요소의 기본값 ───────── */

type Block = Theme['blocks'][number]
type Decor = Theme['freeItems'][number]['decor']

const defaultProps = {
  calendar: { view: 'month', weekStartsOn: 0 },
  todo: { listId: null, showCompleted: true },
  timer: { presetsMin: [25, 5], display: 'ring' },
  image: { assetHash: null, fit: 'cover', focus: { x: 0.5, y: 0.5, zoom: 1 }, shape: 'rect' },
  memo: { memoId: null },
  timetable: { timetableId: null },
} as const

/** 새 그리드 블록(시안의 흰 카드 스타일). 위치/크기 유효성은 호출 측(에디터 리듀서)이 확인한다. */
export function newBlock(
  type: Block['type'],
  size: Block['size'],
  id: string,
  col: number,
  row: number,
): Block {
  const style = type === 'image' ? bannerStyle() : cardStyle()
  return structuredCloneJson({
    id,
    type,
    size,
    col,
    row,
    style,
    props: defaultProps[type],
  }) as Block
}

export const newDecor = (): Decor => ({
  opacity: 1,
  radius: 0,
  border: { width: 0, color: null },
  shadow: 'none',
})

const structuredCloneJson = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T
