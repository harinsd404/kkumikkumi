import { z } from 'zod'
import { isInsideGrid, rectsOverlap, type GridRect } from './grid'

/* ════════════════════════════════════════════════════════════
 * 테마 스키마 (내보내기/가져오기 대상)
 * - 외형 + 배치 + 펫 + 에셋 매니페스트만 포함
 * - Todo/일정/타이머 같은 사용자 데이터는 포함하지 않음 (userdata.ts)
 * - 가져오기 파일은 신뢰할 수 없는 입력: strictObject로 미지의 키 거부
 * ════════════════════════════════════════════════════════════ */

/* ───────── 상수 (초안 값: 실제 UI 확인 후 조정) ───────── */

export const SCHEMA_VERSION = 1 as const

/** 논리 캔버스. 창 크기와 무관하게 이 좌표계에서 배치하고, 렌더 시 균일 스케일 + 창 비율 잠금. */
export const CANVAS = { width: 1600, height: 1000, cols: 8, rows: 5 } as const
export const CELL = { w: CANVAS.width / CANVAS.cols, h: CANVAS.height / CANVAS.rows } as const // 200x200

/**
 * 블록 타입별 크기표 (2026-10-12 디자인 시안 기준). 크기 이름은 타입마다 셀 수가 다르다.
 * 1칸 = 200x200 논리 px, 8x5 그리드. W(배너)는 image 전용.
 * - calendar: M=2x2(주간용), L=4x3
 * - todo:     S=2x2, M=2x3, L=4x3
 * - timer:    S=2x1, M=2x2
 * - image:    S=2x1, M=2x2, L=4x3, W=8x1
 * - memo:     S=2x2, M=2x3, L=4x3 (2026-10-13 추가, todo와 같은 크기표)
 * - timetable: S=2x2, M=2x3 (오늘), L=4x3 (주간) (2026-10-14 추가)
 */
export const BLOCK_SIZES = {
  calendar: { M: { w: 2, h: 2 }, L: { w: 4, h: 3 } },
  todo: { S: { w: 2, h: 2 }, M: { w: 2, h: 3 }, L: { w: 4, h: 3 } },
  timer: { S: { w: 2, h: 1 }, M: { w: 2, h: 2 } },
  image: { S: { w: 2, h: 1 }, M: { w: 2, h: 2 }, L: { w: 4, h: 3 }, W: { w: 8, h: 1 } },
  memo: { S: { w: 2, h: 2 }, M: { w: 2, h: 3 }, L: { w: 4, h: 3 } },
  timetable: { S: { w: 2, h: 2 }, M: { w: 2, h: 3 }, L: { w: 4, h: 3 } },
  dday: { S: { w: 2, h: 1 }, M: { w: 2, h: 2 } },
  studyStats: { S: { w: 2, h: 1 }, M: { w: 2, h: 2 } },
  progress: { S: { w: 2, h: 1 }, M: { w: 2, h: 2 } },
  clock: { S: { w: 2, h: 1 }, M: { w: 2, h: 2 } },
  sprint: { S: { w: 2, h: 1 }, M: { w: 2, h: 2 } },
  habits: { S: { w: 2, h: 1 }, M: { w: 2, h: 2 }, L: { w: 4, h: 3 } },
} as const satisfies Record<
  string,
  Partial<Record<'S' | 'M' | 'L' | 'W', { w: number; h: number }>>
>

export type BlockType = keyof typeof BLOCK_SIZES

/** 블록 타입별 허용 크기 (BLOCK_SIZES에서 파생) */
export const ALLOWED_SIZES = Object.fromEntries(
  Object.entries(BLOCK_SIZES).map(([type, sizes]) => [type, Object.keys(sizes)]),
) as unknown as { readonly [T in BlockType]: readonly (keyof (typeof BLOCK_SIZES)[T])[] }

/** (타입, 크기) → 셀 수. 허용되지 않는 조합이면 null */
export function blockCells(type: BlockType, size: string): { w: number; h: number } | null {
  const table: Partial<Record<string, { w: number; h: number }>> = BLOCK_SIZES[type]
  return table[size] ?? null
}

export const LIMITS = {
  maxBlocks: 40,
  maxFreeItems: 100,
  maxAssets: 150,
  maxAssetBytes: 5 * 1024 * 1024,
  maxTotalAssetBytes: 50 * 1024 * 1024,
  maxAssetPx: 4096,
} as const

/* ───────── 공용 원시 타입 ───────── */

export const Uuid = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
export const Sha256 = z.string().regex(/^[0-9a-f]{64}$/)
export const HexColor = z.string().regex(/^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/)
/** 폰트는 파일이 아니라 ID만 저장. 없는 ID는 렌더 시 기본 폰트로 대체. */
export const FontId = z.string().regex(/^[a-z0-9-]{1,40}$/)
export const BuiltinId = z.string().regex(/^[a-z0-9-]{1,40}$/)
export const EpochMs = z.number().int().nonnegative()
export const DateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/) // 로컬 날짜 (타임존 무관)
export const Name = z.string().trim().min(1).max(40)

/* ───────── 스타일 (구조화된 값만 허용, 원시 CSS 문자열 금지) ───────── */

const decorShape = {
  opacity: z.number().min(0).max(1),
  radius: z.number().min(0).max(64),
  border: z.strictObject({
    width: z.number().min(0).max(16),
    color: HexColor.nullable(), // null = 테마 팔레트 accent
  }),
  shadow: z.enum(['none', 'soft', 'medium', 'strong']),
}

/** 자유 레이어 아이템용 (배경/폰트 없음) */
export const DecorSchema = z.strictObject(decorShape)

/** 그리드 블록용 */
/**
 * 블록 배경 사진(2026-10-20). veil은 사진 위에 블록 배경색(없으면 흰색)을 얼마나 덮을지(글자 읽기 쉽게).
 * 이미지 블록에는 쓰지 않는다.
 */
export const BlockBgImageSchema = z.strictObject({
  assetHash: Sha256,
  focus: z.strictObject({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) }),
  veil: z.number().min(0).max(0.8),
})

export const StyleSchema = z.strictObject({
  ...decorShape,
  bg: HexColor.nullable(), // null = 투명
  fontId: FontId.nullable(), // null = 테마 기본
  textColor: HexColor.nullable(), // null = 테마 팔레트 text
  // 배경 사진이 생기기 전에 저장한 테마는 키가 없으므로 null로 읽는다
  bgImage: BlockBgImageSchema.nullable().default(null),
})

/* ───────── 이미지 콘텐츠 (그리드 image 블록 / 자유 image 아이템 공용) ───────── */

export const ImageContentSchema = z.strictObject({
  assetHash: Sha256.nullable(), // null = 빈 플레이스홀더
  fit: z.enum(['cover', 'contain']),
  focus: z.strictObject({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    zoom: z.number().min(1).max(4),
  }),
  shape: z.enum(['rect', 'circle']), // 둥근 모서리는 style/decor.radius 사용
})

/* ───────── 진행률 블록의 기간 ───────── */

export const ProgressPeriodSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.enum(['day', 'week', 'month', 'year']) }),
  z
    .strictObject({
      kind: z.literal('custom'),
      label: z.string().trim().min(1).max(20),
      start: DateStr,
      end: DateStr,
    })
    .refine((p) => p.start <= p.end, '끝 날짜가 시작 날짜보다 앞이에요'),
])

/* ───────── 그리드 블록 ───────── */

const SizeSchema = z.enum(['S', 'M', 'L', 'W'])

const blockBase = {
  id: Uuid,
  size: SizeSchema,
  col: z.number().int().min(0),
  row: z.number().int().min(0),
  style: StyleSchema,
}

export const BlockSchema = z.discriminatedUnion('type', [
  z.strictObject({
    ...blockBase,
    type: z.literal('calendar'),
    props: z.strictObject({
      view: z.enum(['month', 'week']),
      weekStartsOn: z.union([z.literal(0), z.literal(1)]),
    }),
  }),
  z.strictObject({
    ...blockBase,
    type: z.literal('todo'),
    props: z.strictObject({
      // 참조는 가져오기 후 끊어짐 → 가져올 때 null로 치환(기본 목록 사용)
      listId: Uuid.nullable(),
      showCompleted: z.boolean(),
    }),
  }),
  z.strictObject({
    ...blockBase,
    type: z.literal('timer'),
    props: z.strictObject({
      presetsMin: z.array(z.number().int().min(1).max(180)).min(1).max(6),
      display: z.enum(['digital', 'ring']),
    }),
  }),
  z.strictObject({
    ...blockBase,
    type: z.literal('image'),
    props: ImageContentSchema,
  }),
  z.strictObject({
    ...blockBase,
    type: z.literal('memo'),
    props: z.strictObject({
      // 사용자 데이터(메모) 참조. 가져오기 후 끊어짐 → 가져올 때 null로 치환
      memoId: Uuid.nullable(),
    }),
  }),
  z.strictObject({
    ...blockBase,
    type: z.literal('timetable'),
    props: z.strictObject({
      // 사용자 데이터(시간표) 참조. null = 고른 시간표 따라가기. 가져올 때 null로 치환.
      // 시간표가 하나뿐이던 때 저장한 블록({})은 null로 읽는다.
      timetableId: Uuid.nullable().default(null),
    }),
  }),
  z.strictObject({
    ...blockBase,
    type: z.literal('studyStats'),
    // 타이머 기록(사용자 데이터)으로 계산만 한다. 설정 없음.
    props: z.strictObject({}),
  }),
  z.strictObject({
    ...blockBase,
    type: z.literal('progress'),
    props: z.strictObject({
      /** 보여 줄 기간(S는 첫 번째만). 직접 지정은 이름과 시작~끝 날짜(끝 날 포함) */
      periods: z.array(ProgressPeriodSchema).min(1).max(3),
      weekStartsOn: z.union([z.literal(0), z.literal(1)]),
    }),
  }),
  z.strictObject({
    ...blockBase,
    type: z.literal('sprint'),
    props: z.strictObject({
      // 사용자 데이터(스프린트) 참조. null = 진행 중 중 먼저 끝나는 것(자동). 가져올 때 null로 치환
      sprintId: Uuid.nullable(),
    }),
  }),
  z.strictObject({
    ...blockBase,
    type: z.literal('habits'),
    // 사용자 데이터(습관)를 보여 주기만 한다. 설정 없음
    props: z.strictObject({}),
  }),
  z.strictObject({
    ...blockBase,
    type: z.literal('clock'),
    props: z.strictObject({
      face: z.enum(['digital', 'analog']),
      hour12: z.boolean(),
      showDate: z.boolean(),
    }),
  }),
  z.strictObject({
    ...blockBase,
    type: z.literal('dday'),
    props: z.strictObject({
      // 사용자 데이터(일정) 참조. null = 가장 가까운 다가오는 일정(자동). 가져올 때 null로 치환
      eventId: Uuid.nullable(),
    }),
  }),
])

/* ───────── 자유 배치 레이어 (스티커 / 이미지) ───────── */

const freeBase = {
  id: Uuid,
  x: z.number(), // 논리 캔버스 좌표, 좌상단 기준
  y: z.number(),
  w: z.number().min(16).max(CANVAS.width),
  h: z.number().min(16).max(CANVAS.height),
  rotation: z.number().min(-180).max(180),
  z: z.number().int().min(0).max(999),
  layer: z.enum(['back', 'front']), // back = 그리드 블록 뒤, front = 앞
  locked: z.boolean(),
  decor: DecorSchema,
}

export const FreeItemSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    ...freeBase,
    kind: z.literal('sticker'),
    source: z.discriminatedUnion('type', [
      z.strictObject({ type: z.literal('builtin'), id: BuiltinId }),
      z.strictObject({ type: z.literal('asset'), hash: Sha256 }),
    ]),
  }),
  z.strictObject({
    ...freeBase,
    kind: z.literal('image'),
    content: ImageContentSchema,
  }),
])

/* ───────── 펫 (테마에 포함) ───────── */

export const PetSchema = z.strictObject({
  name: Name,
  /** 화면 px 기준 (펫은 별도 창이라 논리 캔버스 좌표계가 아님) */
  size: z.number().int().min(48).max(256),
  walk: z.boolean(),
  speed: z.enum(['slow', 'normal', 'fast']),
  source: z.discriminatedUnion('type', [
    z.strictObject({ type: z.literal('builtin'), builtinId: BuiltinId }),
    z.strictObject({
      type: z.literal('custom'),
      // rest 필수, 없는 상태는 렌더 시 rest로 대체. PNG만 허용(아래 superRefine에서 mime 검사)
      images: z.strictObject({
        rest: Sha256,
        music: Sha256.nullable(),
        typing: Sha256.nullable(),
      }),
    }),
  ]),
})

/* ───────── 에셋 매니페스트 / 배경 ───────── */

export const AssetSchema = z.strictObject({
  hash: Sha256,
  // 에셋 파이프라인이 PNG/JPEG로만 저장한다(WebP 입력도 변환). SVG 제외.
  mime: z.enum(['image/png', 'image/jpeg']),
  width: z.number().int().min(1).max(LIMITS.maxAssetPx),
  height: z.number().int().min(1).max(LIMITS.maxAssetPx),
  bytes: z.number().int().min(1).max(LIMITS.maxAssetBytes),
})

/** 저장 형식 → 파일 확장자(assets/<hash>.<ext>) */
export const ASSET_EXT_BY_MIME = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
} as const satisfies Record<Asset['mime'], string>
export type AssetExt = (typeof ASSET_EXT_BY_MIME)[Asset['mime']]
/** 파일 확장자 → 저장 형식(ASSET_EXT_BY_MIME의 역) */
export const ASSET_MIME_BY_EXT = Object.fromEntries(
  Object.entries(ASSET_EXT_BY_MIME).map(([mime, ext]) => [ext, mime]),
) as { [M in Asset['mime'] as (typeof ASSET_EXT_BY_MIME)[M]]: M }

/** 내장 배경 무늬 (앱에 들어 있는 SVG를 마스크로 그리고 color로 칠한다. 테마 파일에는 id만 저장) */
export const PatternSchema = z.strictObject({
  id: z.enum(['stars', 'dots']),
  color: HexColor,
})

export const BackgroundSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('color'), color: HexColor, pattern: PatternSchema.nullable() }),
  z.strictObject({
    type: z.literal('image'),
    assetHash: Sha256,
    fit: z.enum(['cover', 'contain']),
  }),
])

/**
 * 테마 팔레트. 블록 내부 요소의 색은 여기서 온다(블록 style은 덮어쓰기용).
 * text: 제목 / subText: 요일·날짜·보조 글자 / accent: 강조 테두리 / check: 체크된 체크박스
 * surface: 날짜 칸 등 안쪽 면 / control: 원형 버튼 배경
 */
export const PaletteSchema = z.strictObject({
  text: HexColor,
  subText: HexColor,
  accent: HexColor,
  check: HexColor,
  surface: HexColor,
  control: HexColor,
})

/** 블록이 차지하는 그리드 사각형. 타입에 허용되지 않는 크기면 null */
export const blockRect = (b: {
  type: BlockType
  col: number
  row: number
  size: string
}): GridRect | null => {
  const cells = blockCells(b.type, b.size)
  return cells ? { col: b.col, row: b.row, ...cells } : null
}

/* ───────── 테마 ───────── */

const ThemeBase = z.strictObject({
  schemaVersion: z.literal(SCHEMA_VERSION),
  id: Uuid,
  name: Name,
  createdAt: EpochMs,
  updatedAt: EpochMs,
  // MVP는 전역 고정 캔버스. 값을 스키마에 두는 이유: 이후 비율 프리셋 확장 시 마이그레이션 대상
  canvas: z.strictObject({
    width: z.literal(CANVAS.width),
    height: z.literal(CANVAS.height),
    cols: z.literal(CANVAS.cols),
    rows: z.literal(CANVAS.rows),
  }),
  defaults: z.strictObject({ fontId: FontId, palette: PaletteSchema }),
  background: BackgroundSchema,
  blocks: z.array(BlockSchema).max(LIMITS.maxBlocks),
  freeItems: z.array(FreeItemSchema).max(LIMITS.maxFreeItems),
  pet: PetSchema,
  assets: z.array(AssetSchema).max(LIMITS.maxAssets),
})

export const ThemeSchema = ThemeBase.superRefine((t, ctx) => {
  const issue = (path: (string | number)[], message: string) =>
    ctx.addIssue({ code: 'custom', path, message })

  /* 1) 그리드: 허용 크기 / 범위 / 겹침 (판정은 grid.ts와 공유) */
  const placed: GridRect[] = []
  t.blocks.forEach((b, i) => {
    const rect = blockRect(b)
    if (!rect) {
      issue(['blocks', i, 'size'], `${b.type} 블록은 ${b.size} 크기를 쓸 수 없음`)
      return
    }
    if (!isInsideGrid(CANVAS, rect)) {
      issue(['blocks', i], '그리드 범위를 벗어남')
      return
    }
    if (placed.some((p) => rectsOverlap(p, rect))) issue(['blocks', i], '다른 블록과 겹침')
    placed.push(rect)
  })

  /* 2) ID 유일성 (blocks + freeItems) */
  const ids = new Set<string>()
  const checkId = (id: string, path: (string | number)[]) => {
    if (ids.has(id)) issue(path, `중복 ID: ${id}`)
    ids.add(id)
  }
  t.blocks.forEach((b, i) => checkId(b.id, ['blocks', i, 'id']))
  t.freeItems.forEach((f, i) => checkId(f.id, ['freeItems', i, 'id']))

  /* 3) 자유 아이템: 캔버스와 최소 일부 교차해야 함 (화면 밖으로 사라져 못 꺼내는 상황 방지) */
  t.freeItems.forEach((f, i) => {
    const visible = f.x + f.w > 0 && f.x < CANVAS.width && f.y + f.h > 0 && f.y < CANVAS.height
    if (!visible) issue(['freeItems', i], '캔버스 밖에 있음')
  })

  /* 4) 에셋: 중복 / 참조 존재 / 총량 / 펫은 PNG만 */
  const assetMap = new Map(t.assets.map((a) => [a.hash, a]))
  if (assetMap.size !== t.assets.length) issue(['assets'], '중복된 에셋 해시')

  const totalBytes = t.assets.reduce((s, a) => s + a.bytes, 0)
  if (totalBytes > LIMITS.maxTotalAssetBytes) issue(['assets'], '에셋 총 용량 초과')

  const needAsset = (hash: string | null, path: (string | number)[], pngOnly = false) => {
    if (hash === null) return
    const a = assetMap.get(hash)
    if (!a) return issue(path, '매니페스트에 없는 에셋 참조')
    if (pngOnly && a.mime !== 'image/png') issue(path, 'PNG만 허용')
  }

  if (t.background.type === 'image') {
    needAsset(t.background.assetHash, ['background', 'assetHash'])
  }
  t.blocks.forEach((b, i) => {
    if (b.type === 'image') needAsset(b.props.assetHash, ['blocks', i, 'props', 'assetHash'])
    if (b.style.bgImage) needAsset(b.style.bgImage.assetHash, ['blocks', i, 'style', 'bgImage'])
  })
  t.freeItems.forEach((f, i) => {
    if (f.kind === 'image') {
      needAsset(f.content.assetHash, ['freeItems', i, 'content', 'assetHash'])
    } else if (f.source.type === 'asset') {
      needAsset(f.source.hash, ['freeItems', i, 'source', 'hash'])
    }
  })
  if (t.pet.source.type === 'custom') {
    const { rest, music, typing } = t.pet.source.images
    needAsset(rest, ['pet', 'source', 'images', 'rest'], true)
    needAsset(music, ['pet', 'source', 'images', 'music'], true)
    needAsset(typing, ['pet', 'source', 'images', 'typing'], true)
  }
})

/* ───────── 타입 / 헬퍼 ───────── */

export type Theme = z.infer<typeof ThemeSchema>
export type GridBlock = z.infer<typeof BlockSchema>
export type FreeItem = z.infer<typeof FreeItemSchema>
export type Pet = z.infer<typeof PetSchema>
export type Asset = z.infer<typeof AssetSchema>
export type BlockSize = z.infer<typeof SizeSchema>
export type Palette = z.infer<typeof PaletteSchema>
export type Pattern = z.infer<typeof PatternSchema>
export type ProgressPeriod = z.infer<typeof ProgressPeriodSchema>
export type BlockBgImage = z.infer<typeof BlockBgImageSchema>

export const parseTheme = (raw: unknown) => ThemeSchema.safeParse(raw)
