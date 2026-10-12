import type { TodoItem, TodoList } from '@kkumikkumi/schema'
import { useState } from 'react'
import './pages.css'
import type { BoardActions, TodoData } from '../board/BoardContext'
import { addDays, localDate } from '../board/calendar'
import checkUrl from '../board/icons/check.svg'
import type { UserData } from '../app/useUserData'
import {
  dueForFilter,
  FILTER_LABEL,
  filterTodos,
  remainingCount,
  type TodoFilter,
} from './todoView'

interface Props {
  todos: TodoData | undefined
  actions: BoardActions
  lists: UserData['lists']
  now: Date
}

const FILTERS: TodoFilter[] = ['today', 'upcoming', 'all', 'done']
const EMPTY_TEXT: Record<TodoFilter, string> = {
  today: '오늘 할 일이 없어요',
  upcoming: '예정된 할 일이 없어요',
  all: '할 일이 없어요',
  done: '완료한 할 일이 없어요',
}

/** "10/13 (화)" 같은 짧은 마감일 표시 */
function dueLabel(due: string, today: string): string {
  if (due === today) return '오늘'
  if (due === addDays(today, 1)) return '내일'
  const [, m, d] = due.split('-').map(Number)
  return `${m}/${d}`
}

/** 할 일 세부 페이지: 목록 사이드바 / 필터·검색 목록 / 선택한 항목 상세 */
export function TodoPage({ todos, actions, lists, now }: Props) {
  const today = localDate(now.getTime())
  const [pickedList, setPickedList] = useState<string | null>(null)
  const [filter, setFilter] = useState<TodoFilter>('all')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<string | null>(null)

  if (!todos) return <div className="pg" />
  // 지워진 목록을 고르고 있었으면 기본 목록으로
  const listId =
    pickedList && todos.lists.some((l) => l.id === pickedList) ? pickedList : todos.defaultListId
  const list = todos.lists.find((l) => l.id === listId)
  const all = todos.items[listId] ?? []
  const shown = filterTodos(all, filter, today, query)
  const item = selected ? all.find((i) => i.id === selected) : undefined

  const pickList = (id: string) => {
    setPickedList(id)
    setSelected(null)
  }

  return (
    <div className={`pg pg-todo ${item ? 'has-detail' : ''}`}>
      <ListSidebar todos={todos} current={listId} onPick={pickList} lists={lists} />

      <section className="pg-card pg-main" aria-label="할 일">
        <header className="pg-head">
          <h1 className="pg-title">{list?.name ?? '할 일'}</h1>
          <input
            className="pg-input pg-search"
            type="search"
            placeholder="검색"
            aria-label="할 일 검색"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </header>
        <div className="pg-tabs" role="tablist" aria-label="보기">
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              role="tab"
              aria-selected={filter === f}
              className="pg-pill"
              onClick={() => setFilter(f)}
            >
              {FILTER_LABEL[f]}
            </button>
          ))}
        </div>
        {filter !== 'done' && (
          <AddItem
            onAdd={(title) => actions.todo.create(listId, title, dueForFilter(filter, today))}
          />
        )}
        {shown.length === 0 ? (
          <p className="pg-empty">{query.trim() ? '찾는 할 일이 없어요' : EMPTY_TEXT[filter]}</p>
        ) : (
          <ul className="pg-list">
            {shown.map((i) => (
              <li key={i.id} className={`pg-row ${i.id === selected ? 'is-selected' : ''}`}>
                <Check item={i} actions={actions} />
                <button
                  type="button"
                  className={`pg-row-main ${i.done ? 'is-done' : ''}`}
                  aria-pressed={i.id === selected}
                  onClick={() => setSelected(i.id === selected ? null : i.id)}
                >
                  <span className="pg-row-title">{i.title}</span>
                  {i.note && <span className="pg-row-note">{i.note}</span>}
                </button>
                {i.dueDate && (
                  <span className={`pg-due ${!i.done && i.dueDate < today ? 'is-overdue' : ''}`}>
                    {dueLabel(i.dueDate, today)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {item && (
        <ItemDetail
          key={item.id}
          item={item}
          lists={todos.lists}
          today={today}
          actions={actions}
          onMoved={setPickedList}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}

function Check({ item, actions }: { item: TodoItem; actions: BoardActions }) {
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

function AddItem({ onAdd }: { onAdd(title: string): Promise<boolean> }) {
  const [text, setText] = useState('')
  return (
    <form
      className="pg-add"
      onSubmit={async (e) => {
        e.preventDefault()
        const t = text.trim()
        if (t && (await onAdd(t))) setText('')
      }}
    >
      <span className="pg-add-plus" aria-hidden>
        +
      </span>
      <input
        className="pg-input"
        placeholder="할 일 추가"
        aria-label="새 할 일"
        maxLength={200}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
    </form>
  )
}

function ListSidebar({
  todos,
  current,
  onPick,
  lists,
}: {
  todos: TodoData
  current: string
  onPick(id: string): void
  lists: UserData['lists']
}) {
  const [name, setName] = useState('')
  const [renaming, setRenaming] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const cur = todos.lists.find((l) => l.id === current)

  return (
    <nav className="pg-card pg-side" aria-label="목록">
      <h2 className="pg-chip">목록</h2>
      <ul className="pg-lists">
        {todos.lists.map((l) => (
          <li key={l.id}>
            {renaming && l.id === current ? (
              <input
                className="pg-input"
                autoFocus
                defaultValue={l.name}
                maxLength={100}
                aria-label="목록 이름"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.nativeEvent.isComposing) e.currentTarget.blur()
                  if (e.key === 'Escape') setRenaming(false)
                }}
                onBlur={(e) => {
                  const v = e.currentTarget.value.trim()
                  if (v && v !== l.name) void lists.rename(l.id, v)
                  setRenaming(false)
                }}
              />
            ) : (
              <button
                type="button"
                className="pg-list-btn"
                aria-current={l.id === current}
                onClick={() => {
                  onPick(l.id)
                  setConfirmDelete(false)
                }}
                onDoubleClick={() => setRenaming(true)}
              >
                <span className="pg-list-name">{l.name}</span>
                <span className="pg-count">{remainingCount(todos.items[l.id] ?? [])}</span>
              </button>
            )}
          </li>
        ))}
      </ul>
      <form
        className="pg-add"
        onSubmit={async (e) => {
          e.preventDefault()
          const n = name.trim()
          if (!n) return
          const created = await lists.create(n)
          if (created) {
            setName('')
            onPick(created.id)
          }
        }}
      >
        <span className="pg-add-plus" aria-hidden>
          +
        </span>
        <input
          className="pg-input"
          placeholder="새 목록"
          aria-label="새 목록 이름"
          maxLength={100}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </form>
      {cur && (
        <div className="pg-side-actions">
          <button type="button" className="pg-pill" onClick={() => setRenaming(true)}>
            이름 바꾸기
          </button>
          <button
            type="button"
            className="pg-pill is-danger"
            onClick={async () => {
              if (!confirmDelete) return setConfirmDelete(true)
              setConfirmDelete(false)
              await lists.remove(cur.id)
            }}
            onBlur={() => setConfirmDelete(false)}
          >
            {confirmDelete ? '할 일까지 지울까요?' : '목록 삭제'}
          </button>
        </div>
      )}
    </nav>
  )
}

function ItemDetail({
  item,
  lists,
  today,
  actions,
  onMoved,
  onClose,
}: {
  item: TodoItem
  lists: readonly TodoList[]
  today: string
  actions: BoardActions
  /** 다른 목록으로 옮기면 그 목록을 따라가 상세를 계속 보여 준다 */
  onMoved(listId: string): void
  onClose(): void
}) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const update = (patch: Parameters<BoardActions['todo']['update']>[1]) =>
    void actions.todo.update(item.id, patch)

  return (
    <aside className="pg-card pg-detail" aria-label="할 일 상세">
      <div className="pg-detail-head">
        <Check item={item} actions={actions} />
        <input
          className="pg-input pg-detail-title"
          defaultValue={item.title}
          maxLength={200}
          aria-label="제목"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) e.currentTarget.blur()
          }}
          onBlur={(e) => {
            const v = e.currentTarget.value.trim()
            if (v && v !== item.title) update({ title: v })
            else e.currentTarget.value = item.title
          }}
        />
      </div>

      <label className="pg-field">
        <span>마감일</span>
        <div className="pg-field-row">
          <input
            className="pg-input"
            type="date"
            value={item.dueDate ?? ''}
            onChange={(e) => update({ dueDate: e.target.value || null })}
          />
        </div>
      </label>
      <div className="pg-quick">
        <button type="button" className="pg-pill" onClick={() => update({ dueDate: today })}>
          오늘
        </button>
        <button
          type="button"
          className="pg-pill"
          onClick={() => update({ dueDate: addDays(today, 1) })}
        >
          내일
        </button>
        <button type="button" className="pg-pill" onClick={() => update({ dueDate: null })}>
          없음
        </button>
      </div>

      <label className="pg-field">
        <span>목록</span>
        <select
          className="pg-input"
          value={item.listId}
          onChange={(e) => {
            update({ listId: e.target.value })
            onMoved(e.target.value)
          }}
        >
          {lists.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </label>

      <label className="pg-field pg-grow">
        <span>메모</span>
        <textarea
          className="pg-input pg-note"
          defaultValue={item.note}
          maxLength={2000}
          placeholder="메모를 남겨 보세요"
          onBlur={(e) => {
            if (e.currentTarget.value !== item.note) update({ note: e.currentTarget.value })
          }}
        />
      </label>

      <div className="pg-detail-actions">
        <button
          type="button"
          className="pg-pill is-danger"
          onClick={async () => {
            if (!confirmDelete) return setConfirmDelete(true)
            if (await actions.todo.remove(item.id)) onClose()
          }}
          onBlur={() => setConfirmDelete(false)}
        >
          {confirmDelete ? '정말 삭제' : '삭제'}
        </button>
        <span className="pg-spacer" />
        <button type="button" className="pg-pill" onClick={onClose}>
          닫기
        </button>
      </div>
    </aside>
  )
}
