import { describe, expect, it } from 'vitest'
import { fitWindowBounds, MIN_BOARD_WIDTH, TITLE_BAR_HEIGHT, windowSizeForBoard } from '../geometry'

const primary = { x: 0, y: 25, width: 1728, height: 1092 }
const second = { x: 1728, y: 0, width: 1920, height: 1080 }

describe('fitWindowBounds', () => {
  it('저장값이 없으면 주 화면 가운데, 16:10 + 타이틀바', () => {
    const b = fitWindowBounds(null, [primary], primary)
    expect(b.width).toBe(1280)
    expect(b.height).toBe(800 + TITLE_BAR_HEIGHT)
    expect(b.x).toBe((1728 - 1280) / 2)
  })
  it('저장값의 폭을 쓰고 비율은 다시 계산', () => {
    const b = fitWindowBounds({ x: 100, y: 100, width: 1000, height: 999 }, [primary], primary)
    expect([b.x, b.y, b.width, b.height]).toEqual([100, 100, 1000, 625 + TITLE_BAR_HEIGHT])
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
})
