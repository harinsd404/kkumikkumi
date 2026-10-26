import { CANVAS, type FreeItem } from '@kkumikkumi/schema'
import { BOARD_GAP, BOARD_PADDING, pitchX, pitchY } from '../../board/layout'

export interface Point {
  x: number
  y: number
}

/** 자유 아이템이 캔버스 안에 최소 이만큼은 보이도록 한다(스키마: 일부라도 교차) */
export const MIN_VISIBLE = 24
export const MIN_ITEM_SIZE = 16

/** 캔버스 좌표(블록 왼쪽 위 기준) → 가장 가까운 칸. 블록 크기를 고려해 그리드 안으로 제한. */
export function snapToCell(
  left: number,
  top: number,
  w: number,
  h: number,
): { col: number; row: number } {
  const col = Math.round((left - BOARD_PADDING) / pitchX)
  const row = Math.round((top - BOARD_PADDING) / pitchY)
  return {
    col: Math.min(Math.max(col, 0), CANVAS.cols - w),
    row: Math.min(Math.max(row, 0), CANVAS.rows - h),
  }
}

/**
 * 갤러리에서 끌어 온 블록(w×h 칸)을 놓을 칸. 커서가 블록 가운데에 오도록 맞춘다.
 * 커서가 캔버스 밖이면 null(놓지 않음).
 */
export function dropCell(p: Point, w: number, h: number): { col: number; row: number } | null {
  if (p.x < 0 || p.y < 0 || p.x > CANVAS.width || p.y > CANVAS.height) return null
  const width = w * pitchX - BOARD_GAP
  const height = h * pitchY - BOARD_GAP
  return snapToCell(p.x - width / 2, p.y - height / 2, w, h)
}

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi)

/** 위치를 캔버스 안에 최소 MIN_VISIBLE만큼 걸치도록 제한 */
export function clampPosition(x: number, y: number, w: number, h: number): Point {
  return {
    x: clamp(x, MIN_VISIBLE - w, CANVAS.width - MIN_VISIBLE),
    y: clamp(y, MIN_VISIBLE - h, CANVAS.height - MIN_VISIBLE),
  }
}

type Box = Pick<FreeItem, 'x' | 'y' | 'w' | 'h' | 'rotation'>
export type Corner = 'nw' | 'ne' | 'sw' | 'se'

const SIGN: Record<Corner, Point> = {
  nw: { x: -1, y: -1 },
  ne: { x: 1, y: -1 },
  sw: { x: -1, y: 1 },
  se: { x: 1, y: 1 },
}
const rad = (deg: number) => (deg * Math.PI) / 180
const rotate = (p: Point, deg: number): Point => {
  const c = Math.cos(rad(deg))
  const s = Math.sin(rad(deg))
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c }
}

/**
 * 회전된 상자의 모서리 크기 조절. 반대쪽 모서리를 고정하고 포인터(캔버스 좌표)까지 늘린다.
 * keepAspect면 원래 비율 유지. 결과는 최소/최대 크기로 제한한다.
 */
export function resizeFromCorner(b: Box, corner: Corner, pointer: Point, keepAspect: boolean): Box {
  const s = SIGN[corner]
  const center = { x: b.x + b.w / 2, y: b.y + b.h / 2 }
  const anchorLocal = { x: (-s.x * b.w) / 2, y: (-s.y * b.h) / 2 }
  const ra = rotate(anchorLocal, b.rotation)
  const anchor = { x: center.x + ra.x, y: center.y + ra.y }
  const d = rotate({ x: pointer.x - anchor.x, y: pointer.y - anchor.y }, -b.rotation)
  let w = clamp(d.x * s.x, MIN_ITEM_SIZE, CANVAS.width)
  let h = clamp(d.y * s.y, MIN_ITEM_SIZE, CANVAS.height)
  if (keepAspect) {
    const k = clamp(
      Math.max(w / b.w, h / b.h),
      Math.max(MIN_ITEM_SIZE / b.w, MIN_ITEM_SIZE / b.h),
      Math.min(CANVAS.width / b.w, CANVAS.height / b.h),
    )
    w = b.w * k
    h = b.h * k
  }
  const off = rotate({ x: (s.x * w) / 2, y: (s.y * h) / 2 }, b.rotation)
  const c2 = { x: anchor.x + off.x, y: anchor.y + off.y }
  return { x: c2.x - w / 2, y: c2.y - h / 2, w, h, rotation: b.rotation }
}

/** 중심에서 포인터 방향 → 회전각(위쪽이 0도). snap이면 15도 단위. 결과는 [-180, 180]. */
export function rotationFromPointer(b: Box, pointer: Point, snap: boolean): number {
  const cx = b.x + b.w / 2
  const cy = b.y + b.h / 2
  let deg = (Math.atan2(pointer.y - cy, pointer.x - cx) * 180) / Math.PI + 90
  if (snap) deg = Math.round(deg / 15) * 15
  deg = ((((deg + 180) % 360) + 360) % 360) - 180
  return Object.is(deg, -0) ? 0 : deg
}

/**
 * 사진 끌어서 위치 조정: 화면에서 사진을 (dx, dy)만큼 끌면 focus(object-position 0~1)를 얼마나 바꿀지.
 * 그려지는 사진의 왼쪽 끝 = -focus.x × (zoom × 맞춘 너비 − 칸 너비)이므로, 넘치는 길이(E)만큼 끌면 0→1.
 * 넘치지 않는 방향(E ≤ 0)은 움직이지 않는다. dx, dy와 box는 같은 단위(캔버스 px).
 */
export function panFocus(
  focus: { x: number; y: number; zoom: number },
  d: { dx: number; dy: number },
  box: { w: number; h: number },
  image: { w: number; h: number },
  fit: 'cover' | 'contain',
): { x: number; y: number } {
  const fitScale =
    fit === 'cover'
      ? Math.max(box.w / image.w, box.h / image.h)
      : Math.min(box.w / image.w, box.h / image.h)
  const ex = focus.zoom * image.w * fitScale - box.w
  const ey = focus.zoom * image.h * fitScale - box.h
  const clamp = (v: number) => Math.min(1, Math.max(0, v))
  return {
    x: ex > 0.5 ? clamp(focus.x - d.dx / ex) : focus.x,
    y: ey > 0.5 ? clamp(focus.y - d.dy / ey) : focus.y,
  }
}

/** 회전한 꾸미기 안에서 끈 거리: 화면 방향 (dx, dy)를 꾸미기의 가로·세로 방향으로 돌린다 */
export function toLocalDelta(
  dx: number,
  dy: number,
  rotationDeg: number,
): { dx: number; dy: number } {
  const r = (-rotationDeg * Math.PI) / 180
  return { dx: dx * Math.cos(r) - dy * Math.sin(r), dy: dx * Math.sin(r) + dy * Math.cos(r) }
}
