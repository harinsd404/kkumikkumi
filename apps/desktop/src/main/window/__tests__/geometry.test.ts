import { describe, expect, it } from 'vitest'
import { WindowStateSchema } from '@kkumikkumi/schema'
import {
  fitWindowBounds,
  MIN_BOARD_WIDTH,
  placeMiniWindow,
  TITLE_BAR_HEIGHT,
  windowSizeForBoard,
} from '../geometry'

const primary = { x: 0, y: 25, width: 1728, height: 1092 }
const second = { x: 1728, y: 0, width: 1920, height: 1080 }

describe('fitWindowBounds', () => {
  it('저장값이 없으면 주 화면 가운데, 16:10 + 타이틀바', () => {
    const b = fitWindowBounds(null, [primary], primary)
    expect(b.width).toBe(1280)
    expect(b.height).toBe(800 + TITLE_BAR_HEIGHT)
    expect(b.x).toBe((1728 - 1280) / 2)
  })
  it('저장된 가로와 세로를 모두 유지한다', () => {
    const b = fitWindowBounds({ x: 100, y: 100, width: 1000, height: 999 }, [primary], primary)
    expect([b.x, b.y, b.width, b.height]).toEqual([100, 100, 1000, 999])
  })
  it('사라진 모니터 위치면 주 화면 가운데로', () => {
    const b = fitWindowBounds({ x: 5000, y: 5000, width: 1000, height: 661 }, [primary], primary)
    expect(b.x).toBe((1728 - 1000) / 2)
  })
  it('두 번째 모니터에 있으면 그 화면 안에 유지', () => {
    const b = fitWindowBounds(
      { x: 3500, y: 10, width: 1000, height: 661 },
      [primary, second],
      primary,
    )
    expect(b.x + b.width).toBeLessThanOrEqual(second.x + second.width)
    expect(b.x).toBeGreaterThanOrEqual(second.x)
  })
  it('작업 영역보다 크면 줄이고, 최소 폭 아래로는 줄이지 않는다', () => {
    const big = fitWindowBounds({ x: 0, y: 25, width: 5000, height: 3161 }, [primary], primary)
    expect(big.height).toBeLessThanOrEqual(primary.height)
    const tiny = fitWindowBounds({ x: 0, y: 25, width: 100, height: 100 }, [primary], primary)
    expect(tiny.width).toBe(MIN_BOARD_WIDTH)
    expect(windowSizeForBoard(MIN_BOARD_WIDTH)).toEqual({ width: 800, height: 536 })
  })
  it('16:9 모니터를 채운 창은 가로를 줄이지 않는다', () => {
    expect(fitWindowBounds(second, [primary, second], primary)).toEqual(second)
  })
  it('세로 모니터의 너비와 높이를 독립적으로 유지한다', () => {
    const portrait = { x: -1080, y: 0, width: 1080, height: 1920 }
    expect(fitWindowBounds(portrait, [primary, portrait], primary)).toEqual(portrait)
  })
  it('두 모니터에 걸치면 첫 화면이 아닌 가장 많이 겹치는 화면을 고른다', () => {
    const saved = { x: 1700, y: 50, width: 1200, height: 700 }
    expect(fitWindowBounds(saved, [primary, second], primary)).toEqual({ ...saved, x: 1728 })
  })
  it('작업 영역이 최소 크기보다 작아도 화면을 넘지 않는다', () => {
    const small = { x: 0, y: 0, width: 640, height: 480 }
    expect(fitWindowBounds(primary, [small], small)).toEqual(small)
  })
  it('이전 창 상태와 새 최대화 상태를 모두 읽는다', () => {
    expect(WindowStateSchema.parse(primary)).toEqual(primary)
    expect(WindowStateSchema.parse({ ...primary, maximized: true }).maximized).toBe(true)
    expect(WindowStateSchema.safeParse({ ...primary, maximized: 'true' }).success).toBe(false)
  })
})

describe('placeMiniWindow', () => {
  const main = { x: 0, y: 25, width: 1440, height: 875 }
  const side = { x: 1440, y: 0, width: 1920, height: 1080 }
  it('처음이면 주 화면 오른쪽 위', () => {
    expect(placeMiniWindow(null, [main], main)).toEqual({
      x: 1440 - 280 - 16,
      y: 25 + 16,
      width: 280,
      height: 140,
    })
  })
  it('저장된 위치가 화면 안이면 그대로(보조 모니터 포함)', () => {
    expect(placeMiniWindow({ x: 2000, y: 100 }, [main, side], main)).toMatchObject({
      x: 2000,
      y: 100,
    })
  })
  it('모니터를 빼서 화면 밖이거나 걸쳐 있으면 기본 위치', () => {
    expect(placeMiniWindow({ x: 2000, y: 100 }, [main], main).x).toBe(1144)
    expect(placeMiniWindow({ x: 1300, y: 100 }, [main], main).x).toBe(1144)
  })
})
