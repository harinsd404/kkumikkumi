import { CANVAS, SCHEMA_VERSION, type Theme } from './theme'

type Style = Theme['blocks'][number]['style']

const defaultStyle = (): Style => ({
  opacity: 1,
  radius: 16,
  border: { width: 0, color: '#000000' },
  shadow: 'soft',
  bg: '#ffffff',
  fontId: null,
  textColor: null,
})

const emptyImage = () =>
  ({
    assetHash: null,
    fit: 'cover',
    focus: { x: 0.5, y: 0.5, zoom: 1 },
    shape: 'rect',
  }) as const

export interface DefaultThemeIds {
  theme: string
  /** 블록 5개에 쓸 UUID (calendar, image M, todo, timer, image S 순) */
  blocks: readonly [string, string, string, string, string]
}

/**
 * 첫 실행용 기본 테마(디자인 캔버스 레이아웃). 에셋 없이 동작하도록 이미지는 빈 플레이스홀더, 펫은 내장.
 * ID와 시각은 주입받아 순수 함수로 유지한다.
 */
export function createDefaultTheme(ids: DefaultThemeIds, now: number, name = '기본'): Theme {
  const [cal, imgM, todo, timer, imgS] = ids.blocks
  return {
    schemaVersion: SCHEMA_VERSION,
    id: ids.theme,
    name,
    createdAt: now,
    updatedAt: now,
    canvas: { ...CANVAS },
    defaults: { fontId: 'pretendard', textColor: '#222222' },
    background: { type: 'color', color: '#f5f5f5' },
    blocks: [
      {
        id: cal,
        type: 'calendar',
        size: 'L',
        col: 0,
        row: 0,
        style: defaultStyle(),
        props: { view: 'month', weekStartsOn: 0 },
      },
      {
        id: imgM,
        type: 'image',
        size: 'M',
        col: 4,
        row: 0,
        style: defaultStyle(),
        props: emptyImage(),
      },
      {
        id: todo,
        type: 'todo',
        size: 'M',
        col: 6,
        row: 0,
        style: defaultStyle(),
        props: { listId: null, showCompleted: false },
      },
      {
        id: timer,
        type: 'timer',
        size: 'S',
        col: 4,
        row: 2,
        style: defaultStyle(),
        props: { presetsMin: [25, 5], display: 'ring' },
      },
      {
        id: imgS,
        type: 'image',
        size: 'S',
        col: 6,
        row: 2,
        style: defaultStyle(),
        props: emptyImage(),
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
