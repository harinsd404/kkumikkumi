import { describe, expect, it } from 'vitest'
import { canPlace, findFreeSlot, placeWithPush, rectsOverlap, type GridItem } from '../grid'

const grid = { cols: 8, rows: 5 }

// CLAUDE.md 스케치: 캘린더(좌, 큼), 이미지(우상), 투두(우하)를 2x2 블록으로 근사
const sketch: GridItem[] = [
  { id: 'cal', col: 0, row: 0, w: 2, h: 2 },
  { id: 'img', col: 6, row: 0, w: 2, h: 2 },
  { id: 'todo', col: 6, row: 2, w: 2, h: 2 },
]

describe('rectsOverlap', () => {
  it('맞닿은 변은 겹침이 아니다', () => {
    expect(rectsOverlap({ col: 0, row: 0, w: 2, h: 1 }, { col: 2, row: 0, w: 1, h: 1 })).toBe(false)
    expect(rectsOverlap({ col: 0, row: 0, w: 1, h: 2 }, { col: 0, row: 2, w: 1, h: 1 })).toBe(false)
  })
  it('한 칸이라도 공유하면 겹침', () => {
    expect(rectsOverlap({ col: 0, row: 0, w: 2, h: 2 }, { col: 1, row: 1, w: 2, h: 2 })).toBe(true)
  })
  it('포함 관계도 겹침', () => {
    expect(rectsOverlap({ col: 0, row: 0, w: 4, h: 4 }, { col: 1, row: 1, w: 1, h: 1 })).toBe(true)
  })
})

describe('canPlace', () => {
  it('빈 그리드의 모서리에 놓을 수 있다', () => {
    expect(canPlace(grid, [], { col: 0, row: 0, w: 1, h: 1 })).toBe(true)
    expect(canPlace(grid, [], { col: 6, row: 3, w: 2, h: 2 })).toBe(true)
  })
  it('그리드 범위를 넘으면 불가', () => {
    expect(canPlace(grid, [], { col: 7, row: 0, w: 2, h: 1 })).toBe(false)
    expect(canPlace(grid, [], { col: 0, row: 4, w: 1, h: 2 })).toBe(false)
    expect(canPlace(grid, [], { col: -1, row: 0, w: 1, h: 1 })).toBe(false)
  })
  it('정수가 아니거나 크기가 0 이하이면 불가', () => {
    expect(canPlace(grid, [], { col: 0.5, row: 0, w: 1, h: 1 })).toBe(false)
    expect(canPlace(grid, [], { col: 0, row: 0, w: 0, h: 1 })).toBe(false)
    expect(canPlace(grid, [], { col: 0, row: 0, w: 1, h: Number.NaN })).toBe(false)
  })
  it('기존 블록과 겹치면 불가', () => {
    expect(canPlace(grid, sketch, { col: 1, row: 1, w: 2, h: 1 })).toBe(false)
  })
  it('겹치지 않으면 가능', () => {
    expect(canPlace(grid, sketch, { col: 2, row: 0, w: 2, h: 2 })).toBe(true)
  })
  it('ignoreId로 자기 자신은 제외한다', () => {
    expect(canPlace(grid, sketch, { col: 1, row: 0, w: 2, h: 2 }, 'cal')).toBe(true)
    expect(canPlace(grid, sketch, { col: 5, row: 0, w: 2, h: 2 }, 'cal')).toBe(false)
  })
})

describe('findFreeSlot', () => {
  it('빈 그리드에서는 (0,0)', () => {
    expect(findFreeSlot(grid, [], { w: 2, h: 2 })).toEqual({ col: 0, row: 0 })
  })
  it('행 우선으로 첫 빈 자리를 찾는다', () => {
    expect(findFreeSlot(grid, sketch, { w: 1, h: 1 })).toEqual({ col: 2, row: 0 })
    expect(findFreeSlot(grid, sketch, { w: 2, h: 2 })).toEqual({ col: 2, row: 0 })
  })
  it('찾은 자리는 canPlace를 만족한다', () => {
    const slot = findFreeSlot(grid, sketch, { w: 2, h: 1 })
    expect(slot).not.toBeNull()
    expect(canPlace(grid, sketch, { ...slot!, w: 2, h: 1 })).toBe(true)
  })
  it('자리가 없으면 null', () => {
    const full: GridItem[] = [{ id: 'all', col: 0, row: 0, w: 8, h: 5 }]
    expect(findFreeSlot(grid, full, { w: 1, h: 1 })).toBeNull()
  })
  it('그리드보다 큰 크기는 null', () => {
    expect(findFreeSlot(grid, [], { w: 9, h: 1 })).toBeNull()
  })
  it('잘못된 크기는 null', () => {
    expect(findFreeSlot(grid, [], { w: 0, h: 1 })).toBeNull()
  })
  it('size에 col/row가 함께 들어와도 탐색 위치를 덮어쓰지 않는다', () => {
    const rectLike = { col: 0, row: 0, w: 1, h: 1 }
    expect(findFreeSlot(grid, sketch, rectLike)).toEqual({ col: 2, row: 0 })
  })
  it('남은 한 칸을 찾는다', () => {
    const items: GridItem[] = [
      { id: 'a', col: 0, row: 0, w: 8, h: 4 },
      { id: 'b', col: 0, row: 4, w: 7, h: 1 },
    ]
    expect(findFreeSlot(grid, items, { w: 1, h: 1 })).toEqual({ col: 7, row: 4 })
    expect(findFreeSlot(grid, items, { w: 2, h: 1 })).toBeNull()
  })
})

describe('placeWithPush', () => {
  const G = { cols: 8, rows: 5 }
  const a = { id: 'a', col: 0, row: 0, w: 2, h: 2 }
  const b = { id: 'b', col: 2, row: 0, w: 2, h: 2 }

  it('겹침이 없으면 이동 없음', () => {
    expect(placeWithPush(G, [a, b], 'a', { col: 0, row: 0, w: 2, h: 1 })?.size).toBe(0)
  })
  it('겹친 아이템을 가장 가까운 빈자리로 민다', () => {
    const m = placeWithPush(G, [a, b], 'a', { col: 0, row: 0, w: 4, h: 2 })
    expect(m?.get('b')).toEqual({ col: 4, row: 0 })
    expect(m?.has('a')).toBe(false)
  })
  it('그리드 밖으로 나가면 안쪽으로 당기고 그 위치를 돌려준다', () => {
    const m = placeWithPush(G, [{ id: 'a', col: 6, row: 3, w: 2, h: 2 }], 'a', {
      col: 6,
      row: 3,
      w: 4,
      h: 3,
    })
    expect(m?.get('a')).toEqual({ col: 4, row: 2 })
  })
  it('밀 곳이 없으면 null', () => {
    const full = { id: 'f', col: 0, row: 2, w: 8, h: 3 }
    expect(placeWithPush(G, [a, b, full], 'a', { col: 0, row: 0, w: 8, h: 2 })).toBeNull()
  })
  it('그리드보다 크면 null', () => {
    expect(placeWithPush(G, [a], 'a', { col: 0, row: 0, w: 9, h: 1 })).toBeNull()
  })
})
