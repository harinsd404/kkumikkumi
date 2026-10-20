import type { Sprint, TodoItem, TodoList } from '@kkumikkumi/schema'
import { useRef, useState, type DragEvent, type ReactNode } from 'react'
import type { TodoPatch } from '../../board/BoardContext'
import { sprintStatus } from '../../board/sprint'

// 할 일 끌어서 옮기기(카테고리 ↔ 카테고리, 스프린트에 넣기/빼기). HTML 끌어 놓기를 쓰고,
// 앱 안에서만 쓰는 형식으로 할 일 id를 실어 파일 끌어 놓기와 섞이지 않게 한다.

const TODO_DRAG = 'application/x-kkumi-todo'

export interface TodoDnd {
  /** 끌고 있는 할 일(없으면 null) */
  dragging: TodoItem | null
  start(item: TodoItem): void
  end(): void
  move(id: string, patch: TodoPatch): void
}

/** 할 일 줄에 붙이는 끌기 속성 */
export const dragRow = (dnd: TodoDnd, item: TodoItem) => ({
  draggable: true,
  onDragStart: (e: DragEvent) => {
    e.dataTransfer.setData(TODO_DRAG, item.id)
    e.dataTransfer.effectAllowed = 'move'
    dnd.start(item)
  },
  onDragEnd: () => dnd.end(),
})

/**
 * 놓을 자리. patchFor가 null이면(이미 거기 있음 등) 놓을 수 없다. 끌고 있는 동안 위에 오면 is-drop-over.
 */
export function DropZone({
  dnd,
  patchFor,
  className,
  as: Tag = 'div',
  children,
  ...rest
}: {
  dnd: TodoDnd
  patchFor(item: TodoItem): TodoPatch | null
  className?: string
  as?: 'div' | 'section' | 'span'
  children: ReactNode
  'aria-label'?: string
  style?: React.CSSProperties
}) {
  const [over, setOver] = useState(false)
  // 안쪽 요소를 지날 때 생기는 dragenter/leave 짝을 센다
  const depth = useRef(0)
  const ok = !!dnd.dragging && patchFor(dnd.dragging) !== null
  return (
    <Tag
      {...rest}
      className={`${className ?? ''} ${ok ? 'is-drop-ok' : ''} ${ok && over ? 'is-drop-over' : ''}`}
      onDragEnter={(e: DragEvent) => {
        if (!e.dataTransfer.types.includes(TODO_DRAG)) return
        depth.current++
        setOver(true)
      }}
      onDragLeave={() => {
        depth.current = Math.max(0, depth.current - 1)
        if (depth.current === 0) setOver(false)
      }}
      onDragOver={(e: DragEvent) => {
        if (!ok || !e.dataTransfer.types.includes(TODO_DRAG)) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
      }}
      onDrop={(e: DragEvent) => {
        depth.current = 0
        setOver(false)
        const item = dnd.dragging
        const patch = item && patchFor(item)
        if (!item || !patch || !e.dataTransfer.types.includes(TODO_DRAG)) return
        e.preventDefault()
        dnd.move(item.id, patch)
        dnd.end()
      }}
    >
      {children}
    </Tag>
  )
}

/** 끌기 시작하면 목록 위에 나타나는 옮길 곳: 다른 카테고리, 스프린트, 스프린트에서 빼기 */
export function DropTray({
  dnd,
  lists,
  sprints,
  today,
}: {
  dnd: TodoDnd
  lists: readonly TodoList[]
  sprints: readonly Sprint[]
  today: string
}) {
  const item = dnd.dragging
  if (!item) return null
  const openSprints = sprints.filter((s) => sprintStatus(s, today) !== 'ended')
  return (
    <div className="tdo-tray" aria-label="옮길 곳">
      <span className="tdo-tray-label">카테고리</span>
      {lists
        .filter((l) => l.id !== item.listId)
        .map((l) => (
          <DropZone
            key={l.id}
            as="span"
            dnd={dnd}
            className="tdo-tray-chip"
            patchFor={(it) => (it.listId === l.id ? null : { listId: l.id })}
          >
            {l.name}
          </DropZone>
        ))}
      {openSprints.length > 0 && <span className="tdo-tray-label">스프린트</span>}
      {openSprints
        .filter((s) => s.id !== item.sprintId)
        .map((s) => (
          <DropZone
            key={s.id}
            as="span"
            dnd={dnd}
            className="tdo-tray-chip"
            style={{ borderColor: s.color }}
            patchFor={(it) => (it.sprintId === s.id ? null : { sprintId: s.id })}
          >
            {s.name}
          </DropZone>
        ))}
      {item.sprintId && (
        <DropZone
          as="span"
          dnd={dnd}
          className="tdo-tray-chip is-out"
          patchFor={(it) => (it.sprintId ? { sprintId: null } : null)}
        >
          스프린트에서 빼기
        </DropZone>
      )}
    </div>
  )
}
