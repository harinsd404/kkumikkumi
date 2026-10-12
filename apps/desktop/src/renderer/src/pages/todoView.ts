// 할 일 세부 페이지의 필터/검색/개수(순수 함수).

export type TodoFilter = 'today' | 'upcoming' | 'all' | 'done'
export const FILTER_LABEL: Record<TodoFilter, string> = {
  today: '오늘',
  upcoming: '예정',
  all: '전체',
  done: '완료됨',
}

interface ItemLike {
  id: string
  title: string
  note: string
  done: boolean
  completedAt: number | null
  dueDate: string | null
  order: number
}

/** 검색어(공백 무시, 대소문자 무시)가 제목이나 메모에 들어 있는가 */
export function matchesQuery(i: Pick<ItemLike, 'title' | 'note'>, query: string): boolean {
  const q = query.trim().toLocaleLowerCase()
  if (!q) return true
  return i.title.toLocaleLowerCase().includes(q) || i.note.toLocaleLowerCase().includes(q)
}

/**
 * 오늘: 안 끝났고 마감이 오늘이거나 지난 것 / 예정: 안 끝났고 마감이 내일 이후(마감일 순)
 * 전체: 안 끝난 모든 항목(목록 순서) / 완료됨: 끝난 항목(최근에 끝낸 순)
 */
export function filterTodos<T extends ItemLike>(
  items: readonly T[],
  filter: TodoFilter,
  today: string,
  query = '',
): T[] {
  const byOrder = (a: T, b: T) => a.order - b.order
  const hit = items.filter((i) => matchesQuery(i, query))
  switch (filter) {
    case 'today':
      return hit.filter((i) => !i.done && i.dueDate !== null && i.dueDate <= today).sort(byOrder)
    case 'upcoming':
      return hit
        .filter((i) => !i.done && i.dueDate !== null && i.dueDate > today)
        .sort((a, b) =>
          a.dueDate! < b.dueDate! ? -1 : a.dueDate! > b.dueDate! ? 1 : byOrder(a, b),
        )
    case 'all':
      return hit.filter((i) => !i.done).sort(byOrder)
    case 'done':
      return hit
        .filter((i) => i.done)
        .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0) || byOrder(a, b))
  }
}

/** 목록 옆에 보여 줄 남은 개수 */
export const remainingCount = (items: readonly Pick<ItemLike, 'done'>[]) =>
  items.filter((i) => !i.done).length

/** 필터에서 새로 추가할 때의 마감일 */
export const dueForFilter = (f: TodoFilter, today: string): string | null =>
  f === 'today' ? today : null
