import {
  ALLOWED_SIZES,
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
  type GridItem,
  type Theme,
} from '@kkumikkumi/schema'
import { clampPosition, MIN_ITEM_SIZE } from './geometry'

/**
 * 에디터 동작 → 새 테마(순수). 실패하면 이유 코드를 돌려주고 테마는 그대로 둔다.
 * 스키마 전체 검증은 저장 직전에 한 번 더 한다(여기서는 그리드/범위 규칙만 즉시 지킨다).
 */
export type EditorAction =
  | { type: 'block/add'; block: { type: GridBlock['type']; size: GridBlock['size'] }; id: string }
  | { type: 'block/move'; id: string; col: number; row: number }
  | { type: 'block/resize'; id: string; size: GridBlock['size'] }
  | { type: 'block/delete'; id: string }
  | { type: 'block/duplicate'; id: string; newId: string }
  | { type: 'block/style'; id: string; patch: Partial<GridBlock['style']> }
  | { type: 'block/props'; id: string; patch: Record<string, unknown> }
  | { type: 'free/add'; item: FreeItem }
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

const gridItems = (blocks: readonly GridBlock[]): GridItem[] =>
  blocks.flatMap((b) => {
    const r = blockRect(b)
    return r ? [{ id: b.id, ...r }] : []
  })

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

export function reduce(t: Theme, a: EditorAction): ReduceResult {
  switch (a.type) {
    case 'block/add': {
      const probe = newBlock(a.block.type, a.block.size, a.id, 0, 0)
      const rect = blockRect(probe)
      if (!rect) return fail('size_not_allowed')
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
      const r = blockRect({ ...b, size: a.size })
      // 겹치는 블록은 가장 가까운 빈자리로 민다. 밀 곳이 없으면 거부.
      const moves = r && placeWithPush(CANVAS, gridItems(t.blocks), a.id, r)
      if (!moves) return fail('no_room')
      return ok({
        ...t,
        blocks: t.blocks.map((x) => {
          const m = moves.get(x.id)
          const next = m ? { ...x, ...m } : x
          return (x.id === a.id ? { ...next, size: a.size } : next) as GridBlock
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
    case 'block/props':
      if (!t.blocks.some((b) => b.id === a.id)) return fail('not_found')
      return ok(
        mapBlock(t, a.id, (b) => ({ ...b, props: { ...b.props, ...a.patch } }) as GridBlock),
      )

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
