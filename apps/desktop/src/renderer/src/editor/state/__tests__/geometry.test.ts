import { describe, expect, it } from 'vitest'
import { blockBox } from '../../../board/layout'
import {
  clampPosition,
  dropCell,
  MIN_ITEM_SIZE,
  MIN_VISIBLE,
  resizeFromCorner,
  rotationFromPointer,
  snapToCell,
} from '../geometry'

const box = { x: 100, y: 100, w: 200, h: 100, rotation: 0 }

describe('dropCell', () => {
  it('커서가 블록 가운데에 오는 칸', () => {
    const b = blockBox({ col: 3, row: 2, w: 2, h: 2 })
    const center = { x: b.left + b.width / 2, y: b.top + b.height / 2 }
    expect(dropCell(center, 2, 2)).toEqual({ col: 3, row: 2 })
  })
  it('가장자리 근처면 그리드 안으로 당긴다', () => {
    expect(dropCell({ x: 5, y: 5 }, 4, 3)).toEqual({ col: 0, row: 0 })
    expect(dropCell({ x: 1595, y: 995 }, 4, 3)).toEqual({ col: 4, row: 2 })
  })
  it('캔버스 밖이면 null', () => {
    expect(dropCell({ x: -1, y: 10 }, 2, 2)).toBeNull()
    expect(dropCell({ x: 10, y: 1001 }, 2, 2)).toBeNull()
  })
})

describe('snapToCell', () => {
  it('칸 위치를 그대로 돌려준다(왕복)', () => {
    const b = blockBox({ col: 3, row: 2, w: 2, h: 1 })
    expect(snapToCell(b.left, b.top, 2, 1)).toEqual({ col: 3, row: 2 })
  })
  it('가까운 칸으로 반올림하고 그리드 안으로 제한', () => {
    const b = blockBox({ col: 3, row: 2, w: 2, h: 1 })
    expect(snapToCell(b.left + 80, b.top - 80, 2, 1)).toEqual({ col: 3, row: 2 })
    expect(snapToCell(b.left + 120, b.top, 2, 1)).toEqual({ col: 4, row: 2 })
    expect(snapToCell(-500, -500, 2, 1)).toEqual({ col: 0, row: 0 })
    expect(snapToCell(5000, 5000, 4, 3)).toEqual({ col: 4, row: 2 })
  })
})

describe('clampPosition', () => {
  it('캔버스 밖으로 완전히 나가지 못한다', () => {
    expect(clampPosition(-1000, -1000, 100, 50)).toEqual({
      x: MIN_VISIBLE - 100,
      y: MIN_VISIBLE - 50,
    })
    expect(clampPosition(5000, 5000, 100, 50)).toEqual({
      x: 1600 - MIN_VISIBLE,
      y: 1000 - MIN_VISIBLE,
    })
    expect(clampPosition(10, 20, 100, 50)).toEqual({ x: 10, y: 20 })
  })
})

describe('resizeFromCorner', () => {
  it('회전 없음: se 모서리를 끌면 nw가 고정', () => {
    expect(resizeFromCorner(box, 'se', { x: 400, y: 300 }, false)).toEqual({
      x: 100,
      y: 100,
      w: 300,
      h: 200,
      rotation: 0,
    })
  })
  it('회전 없음: nw 모서리를 끌면 se가 고정', () => {
    const r = resizeFromCorner(box, 'nw', { x: 50, y: 0 }, false)
    expect([r.x, r.y, r.x + r.w, r.y + r.h]).toEqual([50, 0, 300, 200])
  })
  it('비율 유지', () => {
    const r = resizeFromCorner(box, 'se', { x: 500, y: 150 }, true)
    expect(r.w / r.h).toBeCloseTo(2)
    expect(r.w).toBeCloseTo(400)
  })
  it('최소 크기 아래로 줄지 않는다(뒤집히지 않음)', () => {
    const r = resizeFromCorner(box, 'se', { x: 0, y: 0 }, false)
    expect([r.w, r.h]).toEqual([MIN_ITEM_SIZE, MIN_ITEM_SIZE])
    expect([r.x, r.y]).toEqual([100, 100])
  })
  it('90도 회전: 반대 모서리의 화면 위치가 고정된다', () => {
    const rotated = { ...box, rotation: 90 }
    // 90도 회전 시 se 모서리의 반대(nw 로컬)는 화면에서 오른쪽 위 = (250, 50)
    const anchorBefore = { x: 250, y: 50 }
    const r = resizeFromCorner(rotated, 'se', { x: 100, y: 350 }, false)
    const cx = r.x + r.w / 2
    const cy = r.y + r.h / 2
    // 로컬 (-w/2, -h/2)를 90도 회전 → (h/2, -w/2)
    expect(cx + r.h / 2).toBeCloseTo(anchorBefore.x)
    expect(cy - r.w / 2).toBeCloseTo(anchorBefore.y)
    expect(r.w).toBeCloseTo(300)
    expect(r.h).toBeCloseTo(150)
  })
})

describe('rotationFromPointer', () => {
  const c = { x: 200, y: 150 }
  it('위쪽 0도, 오른쪽 90도, 아래 180도, 왼쪽 -90도', () => {
    expect(rotationFromPointer(box, { x: c.x, y: c.y - 50 }, false)).toBeCloseTo(0)
    expect(rotationFromPointer(box, { x: c.x + 50, y: c.y }, false)).toBeCloseTo(90)
    expect(Math.abs(rotationFromPointer(box, { x: c.x, y: c.y + 50 }, false))).toBeCloseTo(180)
    expect(rotationFromPointer(box, { x: c.x - 50, y: c.y }, false)).toBeCloseTo(-90)
  })
  it('snap이면 15도 단위', () => {
    const deg = rotationFromPointer(box, { x: c.x + 50, y: c.y - 40 }, true)
    expect(deg % 15).toBe(0)
  })
})
