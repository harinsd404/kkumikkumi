import type { Pattern } from '@kkumikkumi/schema'

/**
 * 배경 무늬 한 줄의 위치. 시안(1280x800, 타이틀바 아래 기준)의 배치를 논리 캔버스(×1.25)로 옮긴 것.
 * 시안: 줄 묶음 7개, 묶음마다 A줄(x=9) + 68px 아래 B줄(x=49), 묶음 간격 136px, 첫 줄 y=-50.
 */
export interface PatternRow {
  /** dots의 첫 줄만 시안에서 다른 SVG(첫 점이 작음)를 쓴다 */
  variant: 'first' | 'normal'
  x: number
  y: number
  width: number
  height: number
}

const S = 1.25
const ROW_W = 1292
const ROW_H = 18

export function patternRows(id: Pattern['id']): PatternRow[] {
  const rows: PatternRow[] = []
  for (let g = 0; g < 7; g++) {
    const top = -50 + g * 136
    rows.push({
      variant: g === 0 && id === 'dots' ? 'first' : 'normal',
      x: 9 * S,
      y: top * S,
      width: ROW_W * S,
      height: ROW_H * S,
    })
    rows.push({
      variant: 'normal',
      x: 49 * S,
      y: (top + 68) * S,
      width: ROW_W * S,
      height: ROW_H * S,
    })
  }
  return rows
}
