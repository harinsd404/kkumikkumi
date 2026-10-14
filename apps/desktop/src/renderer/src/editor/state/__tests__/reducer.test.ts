import { createDefaultTheme, parseTheme, type Asset, type Theme } from '@kkumikkumi/schema'
import { describe, expect, it } from 'vitest'
import { newFreeItem, reduce, type EditorAction } from '../reducer'

const U = (n: number) => `00000000-0000-7000-8000-${String(n).padStart(12, '0')}`
const H = (c: string) => c.repeat(64)
// 기본 레이아웃: 배너 W(0,0) / 캘린더 L(0,1) / 투두 M(4,1). 비어 있는 칸: 오른쪽 열 (6..7, 1..3), 맨 아래 줄 (0..7, 4)
const base = (): Theme => createDefaultTheme({ theme: U(1), blocks: [U(2), U(3), U(4)] }, 0)
const BANNER = U(2)
const CAL = U(3)
const TODO = U(4)

const run = (t: Theme, ...actions: EditorAction[]): Theme =>
  actions.reduce((acc, a) => {
    const r = reduce(acc, a)
    if (!r.ok) throw new Error(`${a.type}: ${r.error}`)
    return r.theme
  }, t)
const err = (t: Theme, a: EditorAction) => {
  const r = reduce(t, a)
  return r.ok ? 'ok' : r.error
}
const valid = (t: Theme) => parseTheme(t).success

const asset: Asset = { hash: H('a'), mime: 'image/png', width: 800, height: 400, bytes: 10 }

describe('그리드 블록', () => {
  it('추가하면 행 우선 첫 빈자리에 들어간다', () => {
    const t = run(base(), { type: 'block/add', block: { type: 'timer', size: 'S' }, id: U(9) })
    expect(t.blocks.at(-1)).toMatchObject({ id: U(9), col: 6, row: 1 })
    expect(valid(t)).toBe(true)
  })
  it('놓을 칸을 주면 그 칸에, 겹치거나 밖이면 collision', () => {
    const add = (at: { col: number; row: number }) =>
      ({ type: 'block/add', block: { type: 'timer', size: 'S' }, id: U(9), at }) as const
    const t = run(base(), add({ col: 2, row: 4 }))
    expect(t.blocks.at(-1)).toMatchObject({ id: U(9), col: 2, row: 4 })
    expect(valid(t)).toBe(true)
    expect(err(base(), add({ col: 0, row: 1 }))).toBe('collision') // 캘린더 자리
    expect(err(base(), add({ col: 7, row: 4 }))).toBe('collision') // 2칸이라 밖으로 나감
  })
  it('자리가 없으면 no_space', () => {
    let t = base()
    for (let i = 0; i < 20; i++) {
      const r = reduce(t, {
        type: 'block/add',
        block: { type: 'timer', size: 'S' },
        id: U(100 + i),
      })
      if (!r.ok) {
        expect(r.error).toBe('no_space')
        break
      }
      t = r.theme
    }
    expect(err(t, { type: 'block/add', block: { type: 'timer', size: 'S' }, id: U(99) })).toBe(
      'no_space',
    )
  })
  it('허용되지 않는 크기는 size_not_allowed', () => {
    expect(
      err(base(), { type: 'block/add', block: { type: 'calendar', size: 'S' }, id: U(9) }),
    ).toBe('size_not_allowed')
    expect(err(base(), { type: 'block/resize', id: TODO, size: 'W' })).toBe('size_not_allowed')
  })
  it('이동: 빈 곳은 가능, 겹치면 collision이고 원본은 그대로', () => {
    const t = base()
    expect(
      run(t, { type: 'block/move', id: TODO, col: 6, row: 1 }).blocks.find((b) => b.id === TODO),
    ).toMatchObject({ col: 6, row: 1 })
    expect(err(t, { type: 'block/move', id: TODO, col: 3, row: 1 })).toBe('collision')
    expect(err(t, { type: 'block/move', id: TODO, col: 7, row: 1 })).toBe('collision') // 범위 밖
  })
  it('크기 변경: 겹치는 블록은 가장 가까운 빈자리로 밀린다', () => {
    const t = run(
      base(),
      { type: 'block/add', block: { type: 'timer', size: 'S' }, id: U(9) }, // (6,1)
      { type: 'block/resize', id: TODO, size: 'L' }, // 4x3 (4,1)이 타이머를 덮음
    )
    expect(t.blocks.find((b) => b.id === TODO)).toMatchObject({ size: 'L', col: 4, row: 1 })
    expect(t.blocks.find((b) => b.id === U(9))).toMatchObject({ col: 6, row: 4 })
    expect(valid(t)).toBe(true)
  })
  it('크기 변경: 오른쪽 끝에서 커지면 안쪽으로 당긴다', () => {
    const t = run(
      base(),
      { type: 'block/resize', id: TODO, size: 'S' },
      { type: 'block/move', id: TODO, col: 6, row: 1 },
      { type: 'block/resize', id: TODO, size: 'L' },
    )
    expect(t.blocks.find((b) => b.id === TODO)).toMatchObject({ size: 'L', col: 4, row: 1 })
    expect(valid(t)).toBe(true)
  })
  it('크기 변경: 밀 곳이 없으면 거부하고 원본은 그대로', () => {
    const t = base()
    expect(err(t, { type: 'block/resize', id: BANNER, size: 'L' })).toBe('no_room') // 캘린더 4x3을 둘 곳 없음
    expect(t.blocks.find((b) => b.id === BANNER)?.size).toBe('W')
    expect(
      run(base(), { type: 'block/resize', id: TODO, size: 'L' }).blocks.find((b) => b.id === TODO)
        ?.size,
    ).toBe('L')
    expect(
      run(base(), { type: 'block/resize', id: TODO, size: 'S' }).blocks.find((b) => b.id === TODO)
        ?.size,
    ).toBe('S')
  })
  it('복제는 빈자리에, 삭제', () => {
    const t = run(
      base(),
      { type: 'block/duplicate', id: TODO, newId: U(9) },
      { type: 'block/delete', id: BANNER },
    )
    expect(t.blocks.find((b) => b.id === U(9))).toMatchObject({ type: 'todo', col: 6, row: 1 })
    expect(t.blocks.some((b) => b.id === BANNER)).toBe(false)
    expect(valid(t)).toBe(true)
  })
  it('스타일/props 부분 변경', () => {
    const t = run(
      base(),
      { type: 'block/style', id: CAL, patch: { bg: '#000000', radius: 0 } },
      { type: 'block/props', id: CAL, patch: { weekStartsOn: 1 } },
    )
    const cal = t.blocks.find((b) => b.id === CAL)!
    expect(cal.style).toMatchObject({
      bg: '#000000',
      radius: 0,
      border: { width: 2.5, color: null },
    })
    expect(cal.props).toMatchObject({ weekStartsOn: 1, view: 'month' })
  })
  it('원본 테마는 변하지 않는다(불변)', () => {
    const t = base()
    const snapshot = JSON.stringify(t)
    run(
      t,
      { type: 'block/move', id: TODO, col: 6, row: 1 },
      { type: 'block/style', id: CAL, patch: { bg: null } },
    )
    expect(JSON.stringify(t)).toBe(snapshot)
  })
})

describe('외곽선 통일', () => {
  it('새 블록과 기본 테마의 모든 블록은 같은 외곽선', () => {
    const t = run(base(), { type: 'block/add', block: { type: 'memo', size: 'S' }, id: U(9) })
    expect(new Set(t.blocks.map((b) => JSON.stringify(b.style.border)))).toEqual(
      new Set([JSON.stringify({ width: 2.5, color: null })]),
    )
  })

  it('block/styleAll은 모든 블록에 같은 값을 넣고 다른 스타일은 그대로 둔다', () => {
    const t = run(
      base(),
      {
        type: 'block/style',
        id: TODO,
        patch: { border: { width: 0, color: null }, bg: '#000000' },
      },
      { type: 'block/styleAll', patch: { border: { width: 4, color: '#112233' } } },
    )
    for (const b of t.blocks) expect(b.style.border).toEqual({ width: 4, color: '#112233' })
    expect(t.blocks.find((b) => b.id === TODO)!.style.bg).toBe('#000000')
    expect(valid(t)).toBe(true)
  })
})

describe('자유 아이템', () => {
  const withItems = () =>
    run(
      base(),
      { type: 'asset/add', asset },
      { type: 'free/add', item: newFreeItem('image', U(20), asset) },
      { type: 'free/add', item: newFreeItem('sticker', U(21), asset) },
      { type: 'free/add', item: newFreeItem('sticker', U(22), asset) },
    )

  it('추가: 가운데, 긴 변 400, z는 레이어 맨 위, 스키마 통과', () => {
    const t = withItems()
    expect(t.freeItems.map((i) => i.z)).toEqual([0, 1, 2])
    expect(t.freeItems[0]).toMatchObject({ w: 400, h: 200, x: 600, y: 400 })
    expect(valid(t)).toBe(true)
  })
  it('같은 에셋은 매니페스트에 한 번만', () => {
    expect(run(withItems(), { type: 'asset/add', asset }).assets).toHaveLength(1)
  })
  it('이동은 캔버스 안으로 제한, 크기는 최소값 보장', () => {
    const t = run(withItems(), {
      type: 'free/update',
      id: U(20),
      patch: { x: -9999, y: 9999, w: 1 },
    })
    const i = t.freeItems.find((x) => x.id === U(20))!
    expect(i.w).toBe(16)
    expect(i.x + i.w).toBeGreaterThan(0)
    expect(i.y).toBeLessThan(1000)
    expect(valid(t)).toBe(true)
  })
  it('잠긴 아이템은 위치/크기 변경 불가, 잠금 해제는 가능', () => {
    const t = run(withItems(), { type: 'free/update', id: U(20), patch: { locked: true } })
    expect(err(t, { type: 'free/update', id: U(20), patch: { x: 0 } })).toBe('locked')
    expect(
      run(t, { type: 'free/update', id: U(20), patch: { locked: false } }).freeItems[0]!.locked,
    ).toBe(false)
  })
  it('순서: 앞으로/맨 뒤로', () => {
    let t = run(withItems(), { type: 'free/order', id: U(20), to: 'front' })
    const z = (id: string, th: Theme) => th.freeItems.find((x) => x.id === id)!.z
    expect([z(U(21), t), z(U(22), t), z(U(20), t)]).toEqual([0, 1, 2])
    t = run(t, { type: 'free/order', id: U(20), to: 'back' })
    expect(z(U(20), t)).toBe(0)
    t = run(t, { type: 'free/order', id: U(20), to: 'forward' })
    expect(z(U(20), t)).toBe(1)
  })
  it('레이어 전환하면 그 레이어 맨 위로, 두 레이어 모두 z가 0..n-1', () => {
    const t = run(withItems(), { type: 'free/layer', id: U(21), layer: 'back' })
    expect(t.freeItems.find((x) => x.id === U(21))).toMatchObject({ layer: 'back', z: 0 })
    expect(
      t.freeItems
        .filter((x) => x.layer === 'front')
        .map((x) => x.z)
        .sort(),
    ).toEqual([0, 1])
  })
  it('복제는 살짝 어긋나게, 잠금 해제 상태로 / 삭제 후 z 재정렬', () => {
    let t = run(
      withItems(),
      { type: 'free/update', id: U(20), patch: { locked: true } },
      { type: 'free/duplicate', id: U(20), newId: U(30) },
    )
    const copy = t.freeItems.find((x) => x.id === U(30))!
    expect(copy).toMatchObject({ x: 620, y: 420, locked: false, z: 3 })
    t = run(t, { type: 'free/delete', id: U(21) })
    expect(t.freeItems.map((x) => x.z).sort()).toEqual([0, 1, 2])
    expect(valid(t)).toBe(true)
  })
  it('이미지 콘텐츠/장식 변경, 스티커에는 content 변경 불가', () => {
    const t = run(
      withItems(),
      { type: 'free/content', id: U(20), patch: { shape: 'circle' } },
      { type: 'free/decor', id: U(21), patch: { opacity: 0.5 } },
    )
    expect(t.freeItems.find((x) => x.id === U(20))).toMatchObject({ content: { shape: 'circle' } })
    expect(err(t, { type: 'free/content', id: U(21), patch: { shape: 'circle' } })).toBe(
      'not_found',
    )
  })
})

describe('테마', () => {
  it('배경/팔레트/폰트', () => {
    const t = run(
      base(),
      { type: 'theme/background', patch: { color: '#000000', pattern: null } },
      { type: 'theme/palette', patch: { accent: '#ff0000' } },
      { type: 'theme/font', fontId: 'galmuri11' },
    )
    expect(t.background).toEqual({ type: 'color', color: '#000000', pattern: null })
    expect(t.defaults).toMatchObject({
      fontId: 'galmuri11',
      palette: { accent: '#ff0000', text: '#4a3a36' },
    })
    expect(valid(t)).toBe(true)
  })
})
