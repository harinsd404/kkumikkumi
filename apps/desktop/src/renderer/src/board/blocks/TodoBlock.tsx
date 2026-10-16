import type { GridBlock, Palette, TodoItem } from '@kkumikkumi/schema'
import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import checkUrl from '../icons/check.svg'
import plusUrl from '../icons/plus.svg'
import { useBoard, type BoardActions } from '../BoardContext'
import { addDays, localDate } from '../calendar'
import { sectionTone } from '../colors'
import { usePointerTrack } from '../pointerTrack'
import { paletteVars } from '../style'
import { blockCategories, dueText, isOverdue, reorderIds } from '../todo'

type TodoBlockT = Extract<GridBlock, { type: 'todo' }>

/**
 * 시안(Figma 15:2832 / 15:2781)의 투두 카드. 블록 전체가 "오늘의 할 일"이고, 그 안을 카테고리(할 일 목록)
 * 구역으로 나눈다: 이름 칩(+로 오늘 마감 추가) 아래 할 일(2026-10-16 사용자 지시).
 * props.listId가 null이면 모든 카테고리, 있으면 그 카테고리만. L은 구역을 세 줄로 나란히.
 * actions가 없으면(편집 모드/미리보기) 읽기 전용.
 */
export function TodoBlock({ block }: { block: TodoBlockT }) {
  const { theme, data, actions: all, mode, now } = useBoard()
  const actions = mode === 'use' ? all : undefined // 편집 모드에서는 내용을 바꾸지 않는다
  const p = theme.defaults.palette
  const todos = data.todos
  const today = localDate(now.getTime())
  const sections = todos
    ? blockCategories(
        todos.lists,
        todos.items,
        block.props.listId,
        today,
        block.props.showCompleted,
      )
    : []
  const empty = sections.every((s) => s.items.length === 0)

  return (
    <div className={`kt kt--${block.size}`}>
      <p className="kt-head" style={{ color: p.subText }}>
        오늘의 할 일
      </p>
      {sections.length === 0 ? (
        // 데이터가 없는 미리보기(위젯 갤러리 등)
        <Section
          name="할 일"
          tone={sectionTone(p, 0)}
          items={[]}
          allIds={[]}
          listId={null}
          today={today}
          palette={p}
          actions={undefined}
        />
      ) : (
        sections.map((s, idx) => (
          <Section
            key={s.listId}
            name={s.name}
            tone={sectionTone(p, idx)}
            items={s.items}
            allIds={(todos?.items[s.listId] ?? []).map((i) => i.id)}
            listId={s.listId}
            today={today}
            palette={p}
            actions={actions}
          />
        ))
      )}
      {empty && (
        <p className="kb-empty kb-empty--opaque kt-empty-all" style={{ color: p.subText }}>
          오늘 할 일이 없어요
        </p>
      )}
    </div>
  )
}

function Section({
  name,
  tone,
  items,
  allIds,
  listId,
  today,
  palette: p,
  actions,
}: {
  /** 카테고리 이름 */
  name: string
  tone: { label: string; done: string }
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
  const track = usePointerTrack()
  const editable = !!actions && !!listId

  const commitAdd = async (title: string) => {
    const t = title.trim()
    setAdding(false)
    if (t && actions && listId) await actions.todo.create(listId, t, today)
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
    track(onMove, onUp)
  }

  return (
    <section className="kt-section" aria-label={name}>
      <div className="kt-chip">
        <span style={{ color: tone.label }}>{name}</span>
        {editable ? (
          <button
            type="button"
            className="kt-plus-btn"
            aria-label={`${name}에 오늘 할 일 추가`}
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
          style={paletteVars(p)}
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
      {items.length > 0 && (
        <ul className="kt-list" ref={listRef}>
          {items.map((i, idx) => (
            <Item
              key={i.id}
              item={i}
              today={today}
              palette={p}
              doneColor={tone.done}
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

function Item({
  item: i,
  today,
  palette: p,
  doneColor,
  actions,
  dragging,
  dropBefore,
  onPointerDown,
}: {
  item: TodoItem
  today: string
  palette: Palette
  /** 완료한 체크 상자 바탕(구역 색) */
  doneColor: string
  actions: BoardActions | undefined
  dragging: boolean
  dropBefore: boolean
  onPointerDown(e: ReactPointerEvent): void
}) {
  const [editing, setEditing] = useState(false)
  const [menu, setMenu] = useState(false)
  const overdue = isOverdue(i, today)

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
        data-no-open
        onPointerDown={onPointerDown}
      >
        <button
          type="button"
          className={`kt-check ${i.done ? 'is-done' : ''}`}
          style={i.done ? { background: doneColor } : undefined}
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
            style={paletteVars(p)}
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
        {i.dueDate !== null && i.dueDate !== today && (
          <span className={`kt-due ${overdue ? 'is-overdue' : ''}`} style={{ color: p.subText }}>
            {dueText(i.dueDate, today)}
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
