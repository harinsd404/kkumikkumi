import type { CategorySection } from '../board/todo'

// 할 일 페이지(할 일 + 캘린더)의 보기·검색·카테고리 묶기·날짜별 개수(순수 함수).

export type TodoView = 'day' | 'all' | 'done'
export const VIEW_LABEL: Record<TodoView, string> = {
  day: '이 날',
  all: '전체',
  done: '완료',
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
 * 한 카테고리의 할 일을 보기에 맞게 거르고 정렬한다.
 * - 이 날: 마감이 고른 날인 것(안 끝난 것 먼저). 고른 날이 오늘이면 마감이 지난 못 한 일도.
 * - 전체: 안 끝난 모든 할 일(카테고리 안 순서)
 * - 완료: 끝난 할 일(최근에 끝낸 순)
 */
export function viewItems<T extends ItemLike>(
  items: readonly T[],
  view: TodoView,
  date: string,
  today: string,
  query = '',
): T[] {
  const byOrder = (a: T, b: T) => a.order - b.order
  const hit = items.filter((i) => matchesQuery(i, query))
  switch (view) {
    case 'day':
      return hit
        .filter(
          (i) =>
            i.dueDate === date ||
            (date === today && !i.done && i.dueDate !== null && i.dueDate < today),
        )
        .sort((a, b) => Number(a.done) - Number(b.done) || byOrder(a, b))
    case 'all':
      return hit.filter((i) => !i.done).sort(byOrder)
    case 'done':
      return hit
        .filter((i) => i.done)
        .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0) || byOrder(a, b))
  }
}

/**
 * 카테고리(카테고리 순서)마다 보기에 맞는 할 일. 빈 카테고리도 보여 준다(+로 바로 추가하도록).
 * 검색 중에는 찾은 것이 없는 카테고리를 뺀다.
 */
export function viewSections<T extends ItemLike>(
  lists: readonly { id: string; name: string; order: number }[],
  items: Readonly<Record<string, readonly T[]>>,
  view: TodoView,
  date: string,
  today: string,
  query = '',
): CategorySection<T>[] {
  return [...lists]
    .sort((a, b) => a.order - b.order)
    .map((l) => ({
      listId: l.id,
      name: l.name,
      items: viewItems(items[l.id] ?? [], view, date, today, query),
    }))
    .filter((s) => !query.trim() || s.items.length > 0)
}

/** 날짜별 남은(안 끝난) 할 일 수: 달력 칸의 숫자 배지 */
export function remainingByDay(
  items: Readonly<Record<string, readonly Pick<ItemLike, 'done' | 'dueDate'>[]>>,
): Map<string, number> {
  const out = new Map<string, number>()
  for (const list of Object.values(items))
    for (const i of list)
      if (!i.done && i.dueDate !== null) out.set(i.dueDate, (out.get(i.dueDate) ?? 0) + 1)
  return out
}

/** 카테고리의 +로 추가할 때의 마감일: "이 날" 보기면 고른 날, 아니면 없음 */
export const dueForView = (view: TodoView, date: string): string | null =>
  view === 'day' ? date : null
