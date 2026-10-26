import {
  ALLOWED_SIZES,
  BLOCK_SIZES,
  blockRect,
  CANVAS,
  canPlace,
  findFreeSlot,
  placeWithPush,
  newBlock,
  newDecor,
  type Asset,
  type FreeItem,
  type GridBlock,
  type GridRect,
  type Theme,
} from '@kkumikkumi/schema'
import { gridItems } from '../../board/layout'
import { clampPosition, imageGridRect, MIN_ITEM_SIZE } from './geometry'

/**
 * 에디터 동작 → 새 테마(순수). 실패하면 이유 코드를 돌려주고 테마는 그대로 둔다.
 * 스키마 전체 검증은 저장 직전에 한 번 더 한다(여기서는 그리드/범위 규칙만 즉시 지킨다).
 */
export type EditorAction =
  | {
      type: 'block/add'
      block: { type: GridBlock['type']; size: GridBlock['size'] }
      id: string
      /** 놓을 칸(갤러리에서 끌어 놓기). 없으면 빈 자리를 찾는다. */
      at?: { col: number; row: number }
    }
  | { type: 'block/move'; id: string; col: number; row: number }
  | { type: 'block/resize'; id: string; size: GridBlock['size'] }
  | { type: 'block/resizeImage'; id: string; rect: GridRect }
  | { type: 'block/delete'; id: string }
  | { type: 'block/duplicate'; id: string; newId: string }
  | { type: 'block/style'; id: string; patch: Partial<GridBlock['style']> }
  /** 모든 블록에 같은 스타일 값(한 번의 실행 취소 단위) */
  | { type: 'block/styleAll'; patch: Partial<GridBlock['style']> }
  | { type: 'block/props'; id: string; patch: Record<string, unknown> }
  | { type: 'free/add'; item: FreeItem }
  | { type: 'free/gridImage'; id: string }
  | {
      type: 'free/update'
      id: string
      patch: Partial<Pick<FreeItem, 'x' | 'y' | 'w' | 'h' | 'rotation' | 'locked'>>
    }
  | { type: 'free/decor'; id: string; patch: Partial<FreeItem['decor']> }
  | {
      type: 'free/content'
      id: string
      patch: Partial<Extract<FreeItem, { kind: 'image' }>['content']>
    }
  | { type: 'free/delete'; id: string }
  | { type: 'free/duplicate'; id: string; newId: string }
  | { type: 'free/order'; id: string; to: 'forward' | 'backward' | 'front' | 'back' }
  | { type: 'free/layer'; id: string; layer: FreeItem['layer'] }
  | { type: 'asset/add'; asset: Asset }
  | { type: 'theme/background'; patch: Partial<Extract<Theme['background'], { type: 'color' }>> }
  | { type: 'theme/palette'; patch: Partial<Theme['defaults']['palette']> }
  | { type: 'theme/font'; fontId: string }

export type ReduceError =
  | 'not_found'
  | 'no_space'
  | 'collision'
  | 'no_room'
  | 'size_not_allowed'
  | 'locked'
  | 'too_many'
  | 'background_not_color'

export type ReduceResult = { ok: true; theme: Theme } | { ok: false; error: ReduceError }

const ok = (theme: Theme): ReduceResult => ({ ok: true, theme })
const fail = (error: ReduceError): ReduceResult => ({ ok: false, error })

const mapBlock = (t: Theme, id: string, f: (b: GridBlock) => GridBlock): Theme => ({
  ...t,
  blocks: t.blocks.map((b) => (b.id === id ? f(b) : b)),
})
const mapFree = (t: Theme, id: string, f: (i: FreeItem) => FreeItem): Theme => ({
  ...t,
  freeItems: t.freeItems.map((i) => (i.id === id ? f(i) : i)),
})

/** 레이어 안의 z를 0..n-1로 다시 매긴다(순서 유지) */
const renumber = (items: FreeItem[]): FreeItem[] => {
  const out = items.map((i) => ({ ...i }))
  for (const layer of ['back', 'front'] as const) {
    out
      .filter((i) => i.layer === layer)
      .sort((a, b) => a.z - b.z)
      .forEach((i, n) => (i.z = n))
  }
  return out
}

const topZ = (items: readonly FreeItem[], layer: FreeItem['layer']) =>
  items.filter((i) => i.layer === layer).reduce((m, i) => Math.max(m, i.z + 1), 0)

const imageWithRect = (b: Extract<GridBlock, { type: 'image' }>, r: GridRect): GridBlock => {
  const preset = Object.entries(BLOCK_SIZES.image).find(
    ([, size]) => size.w === r.w && size.h === r.h,
  )?.[0] as GridBlock['size'] | undefined
  const next = { ...b, col: r.col, row: r.row }
  if (preset) {
    next.size = preset
    delete next.span
  } else next.span = { w: r.w, h: r.h }
  return next
}

export function reduce(t: Theme, a: EditorAction): ReduceResult {
  switch (a.type) {
    case 'block/add': {
      const probe = newBlock(a.block.type, a.block.size, a.id, 0, 0)
      const rect = blockRect(probe)
      if (!rect) return fail('size_not_allowed')
      if (a.at) {
        const r = { ...rect, ...a.at }
        if (!canPlace(CANVAS, gridItems(t.blocks), r)) return fail('collision')
        return ok({ ...t, blocks: [...t.blocks, { ...probe, ...a.at }] })
      }
      const slot = findFreeSlot(CANVAS, gridItems(t.blocks), { w: rect.w, h: rect.h })
      if (!slot) return fail('no_space')
      return ok({ ...t, blocks: [...t.blocks, { ...probe, ...slot }] })
    }
    case 'block/move': {
      const b = t.blocks.find((x) => x.id === a.id)
      if (!b) return fail('not_found')
      const r = blockRect({ ...b, col: a.col, row: a.row })
      if (!r || !canPlace(CANVAS, gridItems(t.blocks), r, a.id)) return fail('collision')
      return ok(mapBlock(t, a.id, (x) => ({ ...x, col: a.col, row: a.row })))
    }
    case 'block/resize': {
      const b = t.blocks.find((x) => x.id === a.id)
      if (!b) return fail('not_found')
      if (!(ALLOWED_SIZES[b.type] as readonly string[]).includes(a.size))
        return fail('size_not_allowed')
      const resized = { ...b, size: a.size }
      if (resized.type === 'image') delete resized.span
      const r = blockRect(resized)
      // 겹치는 블록은 가장 가까운 빈자리로 민다. 밀 곳이 없으면 거부.
      const moves = r && placeWithPush(CANVAS, gridItems(t.blocks), a.id, r)
      if (!moves) return fail('no_room')
      return ok({
        ...t,
        blocks: t.blocks.map((x) => {
          const m = moves.get(x.id)
          const source = x.id === a.id ? resized : x
          return m ? { ...source, ...m } : source
        }),
      })
    }
    case 'block/resizeImage': {
      const b = t.blocks.find((x) => x.id === a.id)
      if (!b || b.type !== 'image') return fail('not_found')
      if (![a.rect.col, a.rect.row, a.rect.w, a.rect.h].every(Number.isInteger))
        return fail('size_not_allowed')
      const moves = placeWithPush(CANVAS, gridItems(t.blocks), a.id, a.rect)
      if (!moves) return fail('no_room')
      const old = blockRect(b)!
      if (old.w === a.rect.w && old.h === a.rect.h && moves.size === 0) return ok(t)
      return ok({
        ...t,
        blocks: t.blocks.map((x) => {
          const pos = moves.get(x.id)
          if (x.id !== b.id) return pos ? { ...x, ...pos } : x
          return imageWithRect(b, {
            ...a.rect,
            col: Math.max(0, Math.min(a.rect.col, CANVAS.cols - a.rect.w)),
            row: Math.max(0, Math.min(a.rect.row, CANVAS.rows - a.rect.h)),
          })
        }),
      })
    }
    case 'block/delete':
      if (!t.blocks.some((b) => b.id === a.id)) return fail('not_found')
      return ok({ ...t, blocks: t.blocks.filter((b) => b.id !== a.id) })
    case 'block/duplicate': {
      const b = t.blocks.find((x) => x.id === a.id)
      if (!b) return fail('not_found')
      const r = blockRect(b)!
      const slot = findFreeSlot(CANVAS, gridItems(t.blocks), { w: r.w, h: r.h })
      if (!slot) return fail('no_space')
      const copy = JSON.parse(JSON.stringify(b)) as GridBlock
      return ok({ ...t, blocks: [...t.blocks, { ...copy, id: a.newId, ...slot }] })
    }
    case 'block/style':
      if (!t.blocks.some((b) => b.id === a.id)) return fail('not_found')
      return ok(mapBlock(t, a.id, (b) => ({ ...b, style: { ...b.style, ...a.patch } })))
    case 'block/styleAll':
      return ok({
        ...t,
        blocks: t.blocks.map((b) => ({ ...b, style: { ...b.style, ...a.patch } })),
      })
    case 'block/props':
      if (!t.blocks.some((b) => b.id === a.id)) return fail('not_found')
      return ok(
        mapBlock(t, a.id, (b) => ({ ...b, props: { ...b.props, ...a.patch } }) as GridBlock),
      )

    case 'free/gridImage': {
      const item = t.freeItems.find((f) => f.id === a.id)
      if (!item || item.kind !== 'image') return fail('not_found')
      if (item.locked) return fail('locked')
      if (t.blocks.length >= CANVAS.cols * CANVAS.rows) return fail('no_space')
      const rect = imageGridRect(item)
      const moves = placeWithPush(CANVAS, gridItems(t.blocks), item.id, rect)
      if (!moves) return fail('no_room')
      const block = newBlock('image', 'S', item.id, rect.col, rect.row)
      if (block.type !== 'image') return fail('not_found')
      block.props = item.content
      block.style = { ...block.style, ...item.decor, bg: null }
      return ok({
        ...t,
        blocks: [
          ...t.blocks.map((b) => (moves.has(b.id) ? { ...b, ...moves.get(b.id)! } : b)),
          imageWithRect(block, rect),
        ],
        freeItems: t.freeItems.filter((f) => f.id !== item.id),
      })
    }
    case 'free/add': {
      if (t.freeItems.length >= 100) return fail('too_many')
      const item = {
        ...a.item,
        z: topZ(t.freeItems, a.item.layer),
        ...clampPosition(a.item.x, a.item.y, a.item.w, a.item.h),
      }
      return ok({ ...t, freeItems: [...t.freeItems, item] })
    }
    case 'free/update': {
      const i = t.freeItems.find((x) => x.id === a.id)
      if (!i) return fail('not_found')
      const geometry =
        a.patch.x !== undefined ||
        a.patch.y !== undefined ||
        a.patch.w !== undefined ||
        a.patch.h !== undefined ||
        a.patch.rotation !== undefined
      if (i.locked && geometry) return fail('locked')
      return ok(
        mapFree(t, a.id, (x) => {
          const w = Math.min(Math.max(a.patch.w ?? x.w, MIN_ITEM_SIZE), CANVAS.width)
          const h = Math.min(Math.max(a.patch.h ?? x.h, MIN_ITEM_SIZE), CANVAS.height)
          const pos = clampPosition(a.patch.x ?? x.x, a.patch.y ?? x.y, w, h)
          const rot = a.patch.rotation ?? x.rotation
          return { ...x, ...a.patch, w, h, ...pos, rotation: Math.min(Math.max(rot, -180), 180) }
        }),
      )
    }
    case 'free/decor':
      if (!t.freeItems.some((i) => i.id === a.id)) return fail('not_found')
      return ok(mapFree(t, a.id, (i) => ({ ...i, decor: { ...i.decor, ...a.patch } })))
    case 'free/content': {
      const i = t.freeItems.find((x) => x.id === a.id)
      if (!i || i.kind !== 'image') return fail('not_found')
      return ok(
        mapFree(t, a.id, (x) =>
          x.kind === 'image' ? { ...x, content: { ...x.content, ...a.patch } } : x,
        ),
      )
    }
    case 'free/delete':
      if (!t.freeItems.some((i) => i.id === a.id)) return fail('not_found')
      return ok({ ...t, freeItems: renumber(t.freeItems.filter((i) => i.id !== a.id)) })
    case 'free/duplicate': {
      const i = t.freeItems.find((x) => x.id === a.id)
      if (!i) return fail('not_found')
      if (t.freeItems.length >= 100) return fail('too_many')
      const copy = JSON.parse(JSON.stringify(i)) as FreeItem
      const pos = clampPosition(i.x + 20, i.y + 20, i.w, i.h)
      return ok({
        ...t,
        freeItems: [
          ...t.freeItems,
          { ...copy, id: a.newId, ...pos, locked: false, z: topZ(t.freeItems, i.layer) },
        ],
      })
    }
    case 'free/order': {
      const i = t.freeItems.find((x) => x.id === a.id)
      if (!i) return fail('not_found')
      const same = renumber(t.freeItems)
        .filter((x) => x.layer === i.layer)
        .sort((p, q) => p.z - q.z)
      const idx = same.findIndex((x) => x.id === a.id)
      const target =
        a.to === 'front'
          ? same.length - 1
          : a.to === 'back'
            ? 0
            : a.to === 'forward'
              ? Math.min(idx + 1, same.length - 1)
              : Math.max(idx - 1, 0)
      const [moved] = same.splice(idx, 1)
      same.splice(target, 0, moved!)
      const zById = new Map(same.map((x, n) => [x.id, n]))
      return ok({
        ...t,
        freeItems: t.freeItems.map((x) => (zById.has(x.id) ? { ...x, z: zById.get(x.id)! } : x)),
      })
    }
    case 'free/layer': {
      const i = t.freeItems.find((x) => x.id === a.id)
      if (!i) return fail('not_found')
      if (i.layer === a.layer) return ok(t)
      const moved = mapFree(t, a.id, (x) => ({
        ...x,
        layer: a.layer,
        z: topZ(t.freeItems, a.layer),
      }))
      return ok({ ...moved, freeItems: renumber(moved.freeItems) })
    }

    case 'asset/add':
      if (t.assets.some((x) => x.hash === a.asset.hash)) return ok(t)
      return ok({ ...t, assets: [...t.assets, a.asset] })
    case 'theme/background':
      if (t.background.type !== 'color') return fail('background_not_color')
      return ok({ ...t, background: { ...t.background, ...a.patch, type: 'color' } })
    case 'theme/palette':
      return ok({
        ...t,
        defaults: { ...t.defaults, palette: { ...t.defaults.palette, ...a.patch } },
      })
    case 'theme/font':
      return ok({ ...t, defaults: { ...t.defaults, fontId: a.fontId } })
  }
}

/** 새 자유 이미지/스티커: 긴 변을 400에 맞추되 작은 이미지는 최대 2배까지만 키운다. 기본 위치는 캔버스 가운데. */
export function newFreeItem(
  kind: 'image' | 'sticker',
  id: string,
  asset: Asset,
  center: { x: number; y: number } = { x: CANVAS.width / 2, y: CANVAS.height / 2 },
): FreeItem {
  const s = Math.min(400 / Math.max(asset.width, asset.height), 2)
  const w = Math.max(MIN_ITEM_SIZE, Math.round(asset.width * s))
  const h = Math.max(MIN_ITEM_SIZE, Math.round(asset.height * s))
  const base = {
    id,
    x: center.x - w / 2,
    y: center.y - h / 2,
    w,
    h,
    rotation: 0,
    z: 0,
    layer: 'front' as const,
    locked: false,
    decor: newDecor(),
  }
  return kind === 'image'
    ? {
        ...base,
        kind: 'image',
        content: {
          assetHash: asset.hash,
          fit: 'cover',
          focus: { x: 0.5, y: 0.5, zoom: 1 },
          shape: 'rect',
        },
      }
    : { ...base, kind: 'sticker', source: { type: 'asset', hash: asset.hash } }
}
