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
 * S/M/L → 그리드 셀 크기 (디자인 캔버스 기준으로 확정)
 * 논리 크기: S=400x200, M=400x400, L=800x600 (1칸 200px, 8x5 그리드)
 */
export const SIZE_CELLS = {
  S: { w: 2, h: 1 },
  M: { w: 2, h: 2 },
  L: { w: 4, h: 3 },
} as const

/** 블록 타입별 허용 크기 */
export const ALLOWED_SIZES = {
  calendar: ['M', 'L'],
  todo: ['S', 'M', 'L'],
  timer: ['S', 'M'],
  image: ['S', 'M', 'L'],
} as const

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
export const Name = z.string().trim().min(1).max(40)

/* ───────── 스타일 (구조화된 값만 허용, 원시 CSS 문자열 금지) ───────── */

const decorShape = {
  opacity: z.number().min(0).max(1),
  radius: z.number().min(0).max(64),
  border: z.strictObject({
    width: z.number().min(0).max(16),
    color: HexColor,
  }),
  shadow: z.enum(['none', 'soft', 'medium', 'strong']),
}

/** 자유 레이어 아이템용 (배경/폰트 없음) */
export const DecorSchema = z.strictObject(decorShape)

/** 그리드 블록용 */
export const StyleSchema = z.strictObject({
  ...decorShape,
  bg: HexColor.nullable(), // null = 투명
  fontId: FontId.nullable(), // null = 테마 기본
  textColor: HexColor.nullable(), // null = 테마 기본
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

/* ───────── 그리드 블록 ───────── */

const SizeSchema = z.enum(['S', 'M', 'L'])

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
  mime: z.enum(['image/png', 'image/jpeg', 'image/webp']), // SVG 제외
  width: z.number().int().min(1).max(LIMITS.maxAssetPx),
  height: z.number().int().min(1).max(LIMITS.maxAssetPx),
  bytes: z.number().int().min(1).max(LIMITS.maxAssetBytes),
})

export const BackgroundSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('color'), color: HexColor }),
  z.strictObject({
    type: z.literal('image'),
    assetHash: Sha256,
    fit: z.enum(['cover', 'contain']),
  }),
])

/** 블록이 차지하는 그리드 사각형 (SIZE_CELLS 기준) */
export const blockRect = (b: {
  col: number
  row: number
  size: keyof typeof SIZE_CELLS
}): GridRect => ({
  col: b.col,
  row: b.row,
  ...SIZE_CELLS[b.size],
})

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
  defaults: z.strictObject({ fontId: FontId, textColor: HexColor }),
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
    if (!(ALLOWED_SIZES[b.type] as readonly string[]).includes(b.size)) {
      issue(['blocks', i, 'size'], `${b.type} 블록은 ${b.size} 크기를 쓸 수 없음`)
    }
    const rect = blockRect(b)
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

export const parseTheme = (raw: unknown) => ThemeSchema.safeParse(raw)
