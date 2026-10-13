import { addDays } from './calendar'

// 투두 섹션 분류와 정렬(순수 함수). 시안 15:2781: 오늘의 할 일 / 내일 해야할 일 / 보관함.

export type TodoSection = 'today' | 'tomorrow' | 'inbox'
export const SECTION_LABEL: Record<TodoSection, string> = {
  today: '오늘의 할 일',
  tomorrow: '내일 해야할 일',
  inbox: '보관함',
}

interface ItemLike {
  id: string
  done: boolean
  dueDate: string | null
  order: number
}

/**
 * 오늘: 마감이 오늘이거나 지난 것(overdue 포함) / 내일: 마감이 내일 / 보관함: 마감 없음 또는 모레 이후.
 * 섹션 안은 order 순. showCompleted가 false면 완료 항목을 숨긴다.
 * 마감이 지난 날의 완료 항목은 날짜가 바뀌면 보드에서 빠진다(할 일 페이지 "완료"에서 볼 수 있음).
 */
export function groupTodos<T extends ItemLike>(
  items: readonly T[],
  today: string,
  showCompleted: boolean,
): Record<TodoSection, T[]> {
  const tomorrow = addDays(today, 1)
  const out: Record<TodoSection, T[]> = { today: [], tomorrow: [], inbox: [] }
  for (const i of [...items].sort((a, b) => a.order - b.order)) {
    if (!showCompleted && i.done) continue
    if (i.done && i.dueDate !== null && i.dueDate < today) continue
    const s: TodoSection =
      i.dueDate !== null && i.dueDate <= today
        ? 'today'
        : i.dueDate === tomorrow
          ? 'tomorrow'
          : 'inbox'
    out[s].push(i)
  }
  return out
}

/** 섹션의 + 버튼으로 추가할 때의 마감일 */
export function dueForSection(s: TodoSection, today: string): string | null {
  return s === 'today' ? today : s === 'tomorrow' ? addDays(today, 1) : null
}

/** 지난 마감(오늘 섹션에 보이지만 표시가 필요) */
export const isOverdue = (i: ItemLike, today: string) =>
  !i.done && i.dueDate !== null && i.dueDate < today

/** 크기별로 보여 줄 섹션 */
export function sectionsForSize(size: 'S' | 'M' | 'L' | 'W'): TodoSection[] {
  return size === 'S'
    ? ['today']
    : size === 'M'
      ? ['today', 'tomorrow']
      : ['today', 'tomorrow', 'inbox']
}

/**
 * 목록 전체 순서(ids)에서 movingId를 beforeId 앞으로 옮긴다(beforeId가 null이면 afterId 뒤, 둘 다 없으면 그대로).
 * 화면에서는 섹션 안에서만 끌어 놓으므로, 같은 섹션 항목 사이에 끼워 넣는 결과가 된다.
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
