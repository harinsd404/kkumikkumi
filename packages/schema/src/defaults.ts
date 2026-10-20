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

/**
 * 앱 내장 기본 테마의 고정 ID. 앱을 켤 때마다 있는지 확인해 없으면 만든다(이름 바꾸기/삭제 불가).
 * 가져오기는 ID를 재발급하므로 겹치지 않는다.
 */
export const BUILTIN_THEME_IDS = {
  pudding: '6b756d69-0000-4000-8000-000000000001',
  cottonCandy: '6b756d69-0000-4000-8000-000000000002',
} as const satisfies Record<ThemePresetId, string>

export const builtinPresetOf = (id: string): ThemePresetId | null => {
  const lower = id.toLowerCase()
  for (const k of THEME_PRESET_IDS) if (BUILTIN_THEME_IDS[k] === lower) return k
  return null
}

/* ───────── 새 테마 배치 템플릿 ───────── */

type TemplateBlock = { type: Block['type']; size: Block['size']; col: number; row: number }

/** 새 테마를 만들 때 고르는 배치. 모두 8x5 그리드 안에서 겹치지 않는다(테스트로 확인). */
export const THEME_TEMPLATES = {
  classic: {
    label: '기본',
    hint: '배너 · 캘린더 · 할 일',
    blocks: [
      { type: 'image', size: 'W', col: 0, row: 0 },
      { type: 'calendar', size: 'L', col: 0, row: 1 },
      { type: 'todo', size: 'M', col: 4, row: 1 },
    ],
  },
  photoCalendar: {
    label: '사진 + 캘린더',
    hint: '큰 사진 · 캘린더',
    blocks: [
      { type: 'image', size: 'L', col: 0, row: 1 },
      { type: 'calendar', size: 'L', col: 4, row: 1 },
    ],
  },
  study: {
    label: '공부',
    hint: '시간표 · 할 일 · 타이머',
    blocks: [
      { type: 'image', size: 'W', col: 0, row: 0 },
      { type: 'timetable', size: 'L', col: 0, row: 1 },
      { type: 'todo', size: 'M', col: 4, row: 1 },
      { type: 'timer', size: 'M', col: 6, row: 1 },
    ],
  },
  blank: {
    label: '빈 보드',
    hint: '직접 채우기',
    blocks: [],
  },
} as const satisfies Record<
  string,
  { label: string; hint: string; blocks: readonly TemplateBlock[] }
>

export type ThemeTemplateId = keyof typeof THEME_TEMPLATES
export const THEME_TEMPLATE_IDS = [
  'classic',
  'photoCalendar',
  'study',
  'blank',
] as const satisfies readonly ThemeTemplateId[]

/** 새 테마에 필요한 외형(색/배경/글꼴)과 배치 */
export interface ThemeLook {
  palette: Palette
  background: { color: string; pattern: Pattern | null }
  fontId: string
}

export const presetLook = (preset: ThemePresetId): ThemeLook => {
  const p = THEME_PRESETS[preset]
  return {
    palette: { ...p.palette },
    background: { color: p.background.color, pattern: { ...p.background.pattern } },
    fontId: 'pretendard',
  }
}

/**
 * 새 테마(순수 함수). ID와 시각은 주입받는다. 이미지 블록은 빈 플레이스홀더, 펫은 내장.
 */
export function createTheme(
  ids: { theme: string; newId(): string },
  now: number,
  opts: ThemeLook & { name: string; template: ThemeTemplateId },
): Theme {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: ids.theme,
    name: opts.name,
    createdAt: now,
    updatedAt: now,
    canvas: { ...CANVAS },
    defaults: { fontId: opts.fontId, palette: { ...opts.palette } },
    background: {
      type: 'color',
      color: opts.background.color,
      pattern: opts.background.pattern ? { ...opts.background.pattern } : null,
    },
    blocks: THEME_TEMPLATES[opts.template].blocks.map((b) =>
      newBlock(b.type, b.size, ids.newId(), b.col, b.row),
    ),
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

/** 기본 테마(프리셋 색 + 기본 배치). 내장 기본 테마와 테스트에서 쓴다. */
export function createDefaultTheme(
  ids: { theme: string; blocks: readonly string[] },
  now: number,
  name?: string,
  preset: ThemePresetId = 'pudding',
): Theme {
  let i = 0
  return createTheme(
    {
      theme: ids.theme,
      newId: () => {
        const id = ids.blocks[i++]
        if (!id) throw new Error('블록 ID가 모자람')
        return id
      },
    },
    now,
    { ...presetLook(preset), name: name ?? THEME_PRESETS[preset].name, template: 'classic' },
  )
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
  dday: { eventId: null },
  studyStats: {},
  progress: { periods: [{ kind: 'week' }, { kind: 'month' }, { kind: 'year' }], weekStartsOn: 1 },
  clock: { face: 'digital', hour12: false, showDate: true },
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
