import type { GridBlock, Palette, TodoItem } from '@kkumikkumi/schema'
import { useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import checkUrl from '../icons/check.svg'
import plusUrl from '../icons/plus.svg'
import { useBoard, type BoardActions } from '../BoardContext'
import { addDays, localDate } from '../calendar'
import {
  dueForSection,
  groupTodos,
  isOverdue,
  reorderIds,
  SECTION_LABEL,
  sectionsForSize,
  type TodoSection,
} from '../todo'

type TodoBlockT = Extract<GridBlock, { type: 'todo' }>

/** 입력칸 밑줄 색: 평소 subText, 포커스 시 accent */
const inputLine = (p: Palette) =>
  ({ '--kt-line': p.subText, '--kt-line-focus': p.accent }) as CSSProperties

/**
 * 시안(Figma 15:2832 / 15:2781)의 투두 카드. 섹션: 오늘의 할 일 / 내일 해야할 일 / 보관함.
 * S는 오늘만, M은 오늘+내일, L은 세 섹션을 나란히. actions가 없으면(편집 모드/미리보기) 읽기 전용.
 */
export function TodoBlock({ block }: { block: TodoBlockT }) {
  const { theme, data, actions: all, mode, now } = useBoard()
  const actions = mode === 'use' ? all : undefined // 편집 모드에서는 내용을 바꾸지 않는다
  const p = theme.defaults.palette
  const todos = data.todos
  const listId =
    block.props.listId && todos?.items[block.props.listId]
      ? block.props.listId
      : todos?.defaultListId
  const items = (listId && todos?.items[listId]) || []
  const today = localDate(now.getTime())
  const groups = groupTodos(items, today, block.props.showCompleted)
  const sections = sectionsForSize(block.size)

  return (
    <div className={`kt kt--${block.size}`}>
      {sections.map((s) => (
        <Section
          key={s}
          section={s}
          items={groups[s]}
          allIds={items.map((i) => i.id)}
          listId={listId ?? null}
          today={today}
          palette={p}
          actions={actions}
        />
      ))}
    </div>
  )
}

function Section({
  section,
  items,
  allIds,
  listId,
  today,
  palette: p,
  actions,
}: {
  section: TodoSection
  items: readonly TodoItem[]
  allIds: readonly string[]
  listId: string | null
  today: string
  palette: Palette
  actions: BoardActions | undefined
}) {
  const [adding, setAdding] = useState(false)
  const [drag, setDrag] = useState<{ id: string; overIndex: number } | null>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const editable = !!actions && !!listId

  const commitAdd = async (title: string) => {
    const t = title.trim()
    setAdding(false)
    if (t && actions && listId) await actions.todo.create(listId, t, dueForSection(section, today))
  }

  /** 행 드래그: 화면 좌표끼리만 비교하므로 보드 스케일과 무관 */
  const startDrag = (id: string) => (e: ReactPointerEvent) => {
    if (!editable || e.button !== 0) return
    const target = e.target as HTMLElement
    if (target.closest('button, input')) return
    const startY = e.clientY
    let moved = false
    let over = items.findIndex((i) => i.id === id)
    const onMove = (ev: PointerEvent) => {
      if (!moved && Math.abs(ev.clientY - startY) < 4) return
      moved = true
      const rows = Array.from(listRef.current?.querySelectorAll<HTMLElement>('.kt-item') ?? [])
      over = rows.findIndex((r) => {
        const b = r.getBoundingClientRect()
        return ev.clientY < b.top + b.height / 2
      })
      if (over === -1) over = rows.length
      setDrag({ id, overIndex: over })
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      setDrag(null)
      if (!moved || !actions || !listId) return
      const before = items[over]
      const last = items[items.length - 1]
      const ids =
        before && before.id !== id
          ? reorderIds(allIds, id, { beforeId: before.id })
          : !before && last && last.id !== id
            ? reorderIds(allIds, id, { afterId: last.id })
            : null
      if (ids && ids.join() !== allIds.join()) void actions.todo.reorder(listId, ids)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }

  return (
    <section className="kt-section" aria-label={SECTION_LABEL[section]}>
      <div className="kt-chip">
        <span style={{ color: p.subText }}>{SECTION_LABEL[section]}</span>
        {editable ? (
          <button
            type="button"
            className="kt-plus-btn"
            aria-label={`${SECTION_LABEL[section]}에 추가`}
            onClick={() => setAdding(true)}
          >
            <img className="kt-plus" src={plusUrl} alt="" draggable={false} />
          </button>
        ) : (
          <img className="kt-plus" src={plusUrl} alt="" draggable={false} />
        )}
      </div>
      {adding && (
        <input
          className="kt-input"
          style={inputLine(p)}
          autoFocus
          placeholder="할 일을 입력하고 Enter"
          aria-label="새 할 일"
          maxLength={200}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing)
              void commitAdd(e.currentTarget.value)
            if (e.key === 'Escape') setAdding(false)
          }}
          onBlur={(e) => void commitAdd(e.currentTarget.value)}
        />
      )}
      {items.length === 0 && !adding ? (
        <p className="kt-empty" style={{ color: p.subText }}>
          할 일이 없어요
        </p>
      ) : (
        <ul className="kt-list" ref={listRef}>
          {items.map((i, idx) => (
            <Item
              key={i.id}
              item={i}
              today={today}
              palette={p}
              actions={editable ? actions : undefined}
              dragging={drag?.id === i.id}
              dropBefore={drag !== null && drag.overIndex === idx && drag.id !== i.id}
              onPointerDown={startDrag(i.id)}
            />
          ))}
          {drag !== null && drag.overIndex >= items.length && (
            <li className="kt-drop" style={{ background: p.accent }} aria-hidden />
          )}
        </ul>
      )}
    </section>
  )
}

const shortDate = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`

function Item({
  item: i,
  today,
  palette: p,
  actions,
  dragging,
  dropBefore,
  onPointerDown,
}: {
  item: TodoItem
  today: string
  palette: Palette
  actions: BoardActions | undefined
  dragging: boolean
  dropBefore: boolean
  onPointerDown(e: ReactPointerEvent): void
}) {
  const [editing, setEditing] = useState(false)
  const [menu, setMenu] = useState(false)
  const overdue = isOverdue(i, today)
  const showDue = i.dueDate !== null && (overdue || i.dueDate > addDays(today, 1))

  const commitTitle = (v: string) => {
    setEditing(false)
    const t = v.trim()
    if (t && t !== i.title) void actions?.todo.update(i.id, { title: t })
  }
  const setDue = (dueDate: string | null) => {
    setMenu(false)
    void actions?.todo.update(i.id, { dueDate })
  }

  return (
    <>
      {dropBefore && <li className="kt-drop" style={{ background: p.accent }} aria-hidden />}
      <li
        className={`kt-item ${dragging ? 'is-dragging' : ''} ${i.done ? 'is-done' : ''}`}
        onPointerDown={onPointerDown}
      >
        <button
          type="button"
          className={`kt-check ${i.done ? 'is-done' : ''}`}
          style={i.done ? { background: p.check } : undefined}
          role="checkbox"
          aria-checked={i.done}
          aria-label={i.title}
          disabled={!actions}
          onClick={() => void actions?.todo.update(i.id, { done: !i.done })}
        >
          {i.done && <img src={checkUrl} alt="" draggable={false} />}
        </button>
        {editing ? (
          <input
            className="kt-input kt-input--inline"
            style={inputLine(p)}
            autoFocus
            defaultValue={i.title}
            maxLength={200}
            aria-label="할 일 고치기"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing)
                commitTitle(e.currentTarget.value)
              if (e.key === 'Escape') setEditing(false)
            }}
            onBlur={(e) => commitTitle(e.currentTarget.value)}
          />
        ) : (
          <span className="kt-title" onDoubleClick={() => actions && setEditing(true)}>
            {i.title}
          </span>
        )}
        {showDue && (
          <span className={`kt-due ${overdue ? 'is-overdue' : ''}`} style={{ color: p.subText }}>
            {shortDate(i.dueDate!)}
          </span>
        )}
        {actions && !editing && (
          <span className="kt-tools">
            <button type="button" aria-label="마감일" onClick={() => setMenu((m) => !m)}>
              날짜
            </button>
            <button type="button" aria-label="삭제" onClick={() => void actions.todo.remove(i.id)}>
              ×
            </button>
          </span>
        )}
        {menu && (
          <div className="kt-menu" role="menu">
            <button type="button" role="menuitem" onClick={() => setDue(today)}>
              오늘
            </button>
            <button type="button" role="menuitem" onClick={() => setDue(addDays(today, 1))}>
              내일
            </button>
            <input
              type="date"
              aria-label="날짜 고르기"
              defaultValue={i.dueDate ?? ''}
              onChange={(e) => e.target.value && setDue(e.target.value)}
            />
            <button type="button" role="menuitem" onClick={() => setDue(null)}>
              없음
            </button>
          </div>
        )}
      </li>
    </>
  )
}
