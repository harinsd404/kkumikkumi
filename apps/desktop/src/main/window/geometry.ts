import type { WindowState } from '@kkumikkumi/schema'

/** 보드 비율 16:10 + 앱이 그리는 타이틀바 높이(콘텐츠 안쪽이라 setAspectRatio의 extraSize로 전달) */
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

const intersects = (a: Rect, b: Rect) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height

/**
 * 저장된 창 상태를 현재 화면에 맞게 보정한다(순수 함수).
 * - 비율은 저장값의 폭 기준으로 다시 계산(setSize는 aspect ratio를 강제하지 않음)
 * - 작업 영역보다 크면 줄이고, 어떤 화면과도 겹치지 않으면 주 화면 가운데로
 */
export function fitWindowBounds(
  saved: WindowState | null,
  workAreas: readonly Rect[],
  primary: Rect,
): Rect {
  const target = saved ? workAreas.find((w) => intersects(w, saved)) : undefined
  const area = target ?? primary
  const maxBoardWidth = Math.min(area.width, (area.height - TITLE_BAR_HEIGHT) * BOARD_RATIO)
  const wanted = saved?.width ?? DEFAULT_BOARD_WIDTH
  const boardWidth = Math.max(
    Math.min(MIN_BOARD_WIDTH, maxBoardWidth),
    Math.min(wanted, maxBoardWidth),
  )
  const size = windowSizeForBoard(boardWidth)

  if (saved && target) {
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
