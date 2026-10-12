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

/**
 * target 자리에 id 아이템을 놓고, 겹치는 다른 아이템은 원래 위치에서 가장 가까운 빈자리로 민다.
 * target이 그리드 밖으로 나가면 먼저 안쪽으로 당긴다(오른쪽/아래 끝에서 커질 때).
 * 밀린 아이템은 큰 것부터 배치하고, 거리(|Δcol|+|Δrow|)가 같으면 위→아래, 왼→오른쪽 순.
 * 둘 곳이 없는 아이템이 하나라도 있으면 null. 반환: 위치가 바뀐 아이템만 id → 새 위치.
 */
export function placeWithPush(
  grid: GridDims,
  items: readonly GridItem[],
  id: string,
  target: GridRect,
): Map<string, { col: number; row: number }> | null {
  if (!isPosInt(target.w) || !isPosInt(target.h)) return null
  if (target.w > grid.cols || target.h > grid.rows) return null
  const placed: GridRect = {
    col: Math.max(0, Math.min(target.col, grid.cols - target.w)),
    row: Math.max(0, Math.min(target.row, grid.rows - target.h)),
    w: target.w,
    h: target.h,
  }
  const others = items.filter((it) => it.id !== id)
  const displaced = others
    .filter((it) => rectsOverlap(it, placed))
    .sort((a, b) => b.w * b.h - a.w * a.h)
  const fixed: GridItem[] = [...others.filter((it) => !rectsOverlap(it, placed)), { id, ...placed }]
  const moves = new Map<string, { col: number; row: number }>()
  const original = items.find((it) => it.id === id)
  if (original && (original.col !== placed.col || original.row !== placed.row)) {
    moves.set(id, { col: placed.col, row: placed.row })
  }
  for (const it of displaced) {
    let best: { col: number; row: number; d: number } | null = null
    for (let row = 0; row + it.h <= grid.rows; row++) {
      for (let col = 0; col + it.w <= grid.cols; col++) {
        if (!canPlace(grid, fixed, { col, row, w: it.w, h: it.h })) continue
        const d = Math.abs(col - it.col) + Math.abs(row - it.row)
        if (!best || d < best.d) best = { col, row, d }
      }
    }
    if (!best) return null
    fixed.push({ id: it.id, col: best.col, row: best.row, w: it.w, h: it.h })
    moves.set(it.id, { col: best.col, row: best.row })
  }
  return moves
}
