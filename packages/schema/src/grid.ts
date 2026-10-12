// 그리드 판정 순수 함수. 좌표는 0부터 시작하는 칸 단위, (col,row)는 블록의 왼쪽 위 칸.
// 테마 스키마와 독립된 사각형만 다룬다.

export interface GridDims {
  readonly cols: number
  readonly rows: number
}

export interface GridSize {
  readonly w: number
  readonly h: number
}

export interface GridRect extends GridSize {
  readonly col: number
  readonly row: number
}

export interface GridItem extends GridRect {
  readonly id: string
}

const isNonNegInt = (n: number): boolean => Number.isInteger(n) && n >= 0
const isPosInt = (n: number): boolean => Number.isInteger(n) && n > 0

export function isInsideGrid(grid: GridDims, rect: GridRect): boolean {
  return (
    isNonNegInt(rect.col) &&
    isNonNegInt(rect.row) &&
    isPosInt(rect.w) &&
    isPosInt(rect.h) &&
    rect.col + rect.w <= grid.cols &&
    rect.row + rect.h <= grid.rows
  )
}

export function rectsOverlap(a: GridRect, b: GridRect): boolean {
  return a.col < b.col + b.w && b.col < a.col + a.w && a.row < b.row + b.h && b.row < a.row + a.h
}

/**
 * candidate를 놓을 수 있으면 true. 그리드 밖이거나 다른 아이템과 겹치면 false.
 * ignoreId: 이동 중인 자기 자신을 겹침 판정에서 제외할 때 사용.
 */
export function canPlace(
  grid: GridDims,
  items: readonly GridItem[],
  candidate: GridRect,
  ignoreId?: string,
): boolean {
  if (!isInsideGrid(grid, candidate)) return false
  return items.every((item) => item.id === ignoreId || !rectsOverlap(item, candidate))
}

/** 행 우선(위→아래, 왼→오른쪽)으로 첫 빈 자리를 찾는다. 없으면 null. */
export function findFreeSlot(
  grid: GridDims,
  items: readonly GridItem[],
  size: GridSize,
): { col: number; row: number } | null {
  if (!isPosInt(size.w) || !isPosInt(size.h)) return null
  for (let row = 0; row + size.h <= grid.rows; row++) {
    for (let col = 0; col + size.w <= grid.cols; col++) {
      // size에 col/row가 섞여 들어와도 덮어쓰지 않도록 w/h만 꺼낸다
      if (canPlace(grid, items, { col, row, w: size.w, h: size.h })) return { col, row }
    }
  }
  return null
}
