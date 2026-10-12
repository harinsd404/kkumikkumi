import { CANVAS, CELL, type GridRect } from '@kkumikkumi/schema'

/**
 * 시안의 바깥 여백과 블록 간격(1280px 기준 20px)을 논리 캔버스(×1.25)로 환산한 값.
 * 그리드 판정은 칸 단위로 하고, 그릴 때만 여백/간격을 반영한다(스키마와 무관).
 */
export const BOARD_PADDING = 25
export const BOARD_GAP = 25

export const pitchX = (CANVAS.width - 2 * BOARD_PADDING + BOARD_GAP) / CANVAS.cols
export const pitchY = (CANVAS.height - 2 * BOARD_PADDING + BOARD_GAP) / CANVAS.rows

export interface Box {
  left: number
  top: number
  width: number
  height: number
}

/** 그리드 사각형 → 논리 캔버스 상자(px). 칸 경계가 아니라 여백/간격을 뺀 실제 카드 영역. */
export function blockBox(r: GridRect): Box {
  return {
    left: BOARD_PADDING + r.col * pitchX,
    top: BOARD_PADDING + r.row * pitchY,
    width: r.w * pitchX - BOARD_GAP,
    height: r.h * pitchY - BOARD_GAP,
  }
}

/** 창(보드 영역) 크기 → 균일 스케일과 가운데 정렬 오프셋 */
export function fitScale(containerW: number, containerH: number) {
  const scale = Math.max(0, Math.min(containerW / CANVAS.width, containerH / CANVAS.height))
  return {
    scale,
    offsetX: (containerW - CANVAS.width * scale) / 2,
    offsetY: (containerH - CANVAS.height * scale) / 2,
  }
}

export { CELL }
