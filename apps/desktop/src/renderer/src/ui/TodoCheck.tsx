import type { TodoItem } from '@kkumikkumi/schema'
import type { BoardActions } from '../board/BoardContext'
import checkUrl from '../board/icons/check.svg'

/** 할 일 완료 체크(세부 페이지 공용, .pg-check) */
export function TodoCheck({
  item,
  actions,
}: {
  item: Pick<TodoItem, 'id' | 'done'>
  actions: BoardActions
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={item.done}
      aria-label={item.done ? '완료 취소' : '완료'}
      className={`pg-check ${item.done ? 'is-done' : ''}`}
      onClick={() => void actions.todo.update(item.id, { done: !item.done })}
    >
      {item.done && <img src={checkUrl} alt="" draggable={false} />}
    </button>
  )
}
