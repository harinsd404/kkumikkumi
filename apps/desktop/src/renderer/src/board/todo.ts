import { addDays, monthDay } from './calendar'

// 할 일을 카테고리(할 일 목록)별로 나누고 정렬한다(순수 함수).
// 보드 블록과 할 일 페이지가 같이 쓴다. 카테고리 = 데이터의 todo_lists(이름만 "카테고리"로 보여 준다).

interface ItemLike {
  id: string
  done: boolean
  dueDate: string | null
  order: number
}

export interface CategorySection<T> {
  listId: string
  name: string
  items: T[]
}

/**
 * 보드 블록: 카테고리마다 할 일(order 순). pinned가 있는 카테고리면 그것만, 아니면 전부(카테고리 순서).
 * showCompleted가 false면 완료 항목을 숨긴다. 마감이 지난 날의 완료 항목은 날짜가 바뀌면 빠진다
 * (할 일 페이지 "완료"에서 볼 수 있음).
 */
export function blockCategories<T extends ItemLike>(
  lists: readonly { id: string; name: string; order: number }[],
  items: Readonly<Record<string, readonly T[]>>,
  pinned: string | null,
  today: string,
  showCompleted: boolean,
): CategorySection<T>[] {
  const only = pinned && lists.some((l) => l.id === pinned) ? pinned : null
  return [...lists]
    .sort((a, b) => a.order - b.order)
    .filter((l) => only === null || l.id === only)
    .map((l) => ({
      listId: l.id,
      name: l.name,
      items: [...(items[l.id] ?? [])]
        .sort((a, b) => a.order - b.order)
        .filter((i) => showCompleted || !i.done)
        .filter((i) => !(i.done && i.dueDate !== null && i.dueDate < today)),
    }))
}

/** 마감일 짧은 표시: 오늘 / 내일 / 10/13 */
export function dueText(due: string, today: string): string {
  if (due === today) return '오늘'
  if (due === addDays(today, 1)) return '내일'
  const { m, d } = monthDay(due)
  return `${m}/${d}`
}

/** 지난 마감(빨갛게 표시) */
export const isOverdue = (i: ItemLike, today: string) =>
  !i.done && i.dueDate !== null && i.dueDate < today

/**
 * 목록 전체 순서(ids)에서 movingId를 beforeId 앞으로 옮긴다(beforeId가 null이면 afterId 뒤, 둘 다 없으면 그대로).
 * 화면에서는 카테고리 안에서만 끌어 놓는다.
 */
export function reorderIds(
  ids: readonly string[],
  movingId: string,
  target: { beforeId: string } | { afterId: string },
): string[] {
  if (!ids.includes(movingId)) return [...ids]
  const anchor = 'beforeId' in target ? target.beforeId : target.afterId
  if (anchor === movingId || !ids.includes(anchor)) return [...ids]
  const rest = ids.filter((id) => id !== movingId)
  const at = rest.indexOf(anchor) + ('beforeId' in target ? 0 : 1)
  return [...rest.slice(0, at), movingId, ...rest.slice(at)]
}
