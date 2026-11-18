import type { WindowState } from '@kkumikkumi/schema'

/** 최초 창 크기에만 사용하는 보드 비율. 실제 창 크기/최대화는 모니터 비율을 따른다. */
export const BOARD_RATIO = 16 / 10
export const TITLE_BAR_HEIGHT = 36
export const DEFAULT_BOARD_WIDTH = 1280
export const MIN_BOARD_WIDTH = 800

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/** 보드 폭 → 창(콘텐츠) 크기. hiddenInset 타이틀바라 창 크기 = 콘텐츠 크기. */
export const windowSizeForBoard = (boardWidth: number) => ({
  width: Math.round(boardWidth),
  height: Math.round(boardWidth / BOARD_RATIO) + TITLE_BAR_HEIGHT,
})

const overlap = (a: Rect, b: Rect) =>
  Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) *
  Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y))

/** 두 화면에 걸친 창은 가장 많이 겹치는 작업 영역을 사용한다. */
export function windowWorkArea(
  saved: Rect | null,
  workAreas: readonly Rect[],
  primary: Rect,
): Rect {
  if (!saved) return primary
  return workAreas.reduce(
    (best, area) => (overlap(saved, area) > overlap(saved, best) ? area : best),
    primary,
  )
}

/**
 * 저장된 창 상태를 현재 화면에 맞게 보정한다(순수 함수).
 * - 저장된 가로/세로 크기를 독립적으로 유지한다(16:9·세로 화면도 허용).
 * - 작업 영역보다 크면 줄이고, 어떤 화면과도 겹치지 않으면 주 화면 가운데로
 */
export function fitWindowBounds(
  saved: WindowState | null,
  workAreas: readonly Rect[],
  primary: Rect,
): Rect {
  const area = windowWorkArea(saved, workAreas, primary)
  const defaults = windowSizeForBoard(DEFAULT_BOARD_WIDTH)
  const min = windowSizeForBoard(MIN_BOARD_WIDTH)
  const size = {
    width: Math.min(area.width, Math.max(min.width, saved?.width ?? defaults.width)),
    height: Math.min(area.height, Math.max(min.height, saved?.height ?? defaults.height)),
  }

  if (saved && overlap(saved, area) > 0) {
    // 화면 안으로 끌어들인다
    const x = Math.min(Math.max(saved.x, area.x), area.x + area.width - size.width)
    const y = Math.min(Math.max(saved.y, area.y), area.y + area.height - size.height)
    return { x, y, ...size }
  }
  return {
    x: Math.round(area.x + (area.width - size.width) / 2),
    y: Math.round(area.y + (area.height - size.height) / 2),
    ...size,
  }
}

/** 미니 타이머 창 크기(고정) */
export const MINI_SIZE = { width: 280, height: 140 } as const
const MINI_MARGIN = 16

/**
 * 미니 타이머 창 위치. 저장된 위치가 어떤 화면 안에 완전히 들어가면 그대로,
 * 아니면(모니터를 뺐거나 처음) 주 화면 오른쪽 위에 둔다.
 */
export function placeMiniWindow(
  saved: { x: number; y: number } | null,
  workAreas: readonly Rect[],
  primary: Rect,
): Rect {
  const { width, height } = MINI_SIZE
  if (saved) {
    const fits = workAreas.some(
      (a) =>
        saved.x >= a.x &&
        saved.y >= a.y &&
        saved.x + width <= a.x + a.width &&
        saved.y + height <= a.y + a.height,
    )
    if (fits) return { x: saved.x, y: saved.y, width, height }
  }
  return {
    x: primary.x + primary.width - width - MINI_MARGIN,
    y: primary.y + MINI_MARGIN,
    width,
    height,
  }
}
