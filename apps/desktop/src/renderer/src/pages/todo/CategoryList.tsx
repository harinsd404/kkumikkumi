import type { TodoItem, TodoList } from '@kkumikkumi/schema'
import { useState } from 'react'
import type { BoardActions } from '../../board/BoardContext'
import { addDays } from '../../board/calendar'
import { sectionTone } from '../../board/colors'
import plusUrl from '../../board/icons/plus.svg'
import { dueText, isOverdue, type CategorySection } from '../../board/todo'
import type { UserData } from '../../app/useUserData'
import { ConfirmButton } from '../../ui/ConfirmButton'
import { InlineRename } from '../../ui/InlineRename'
import { TodoCheck } from '../../ui/TodoCheck'
import type { TodoView } from '../todoView'

interface Common {
  view: TodoView
  /** 고른 날 */
  date: string
  today: string
  palette: { accent: string; check: string }
  allLists: readonly TodoList[]
  actions: BoardActions
  lists: UserData['lists']
  /** 펼친(상세를 보는) 할 일 */
  openId: string | null
  onOpen(id: string | null): void
  /** + 로 추가할 때의 마감일 */
  addDue: string | null
}

/** 카테고리마다 이름 칩(+로 추가) 아래 할 일. 맨 아래에서 새 카테고리를 만든다. */
export function CategoryList({
  sections,
  ...c
}: Common & { sections: readonly CategorySection<TodoItem>[] }) {
  return (
    <div className="tdo-cats">
      {sections.map((s, idx) => (
        <Category key={s.listId} section={s} tone={sectionTone(c.palette, idx)} {...c} />
      ))}
      <NewCategory lists={c.lists} />
    </div>
  )
}

function Category({
  section: s,
  tone,
  view,
  date,
  today,
  allLists,
  actions,
  lists,
  openId,
  onOpen,
  addDue,
}: Common & { section: CategorySection<TodoItem>; tone: { label: string } }) {
  const [adding, setAdding] = useState(false)
  const [renaming, setRenaming] = useState(false)

  const commitAdd = async (title: string) => {
    const t = title.trim()
    setAdding(false)
    if (t) await actions.todo.create(s.listId, t, addDue)
  }

  return (
    <section className="tdo-cat" aria-label={s.name}>
      <div className="tdo-cat-head">
        <span className="tdo-cat-chip">
          {renaming ? (
            <InlineRename
              name={s.name}
              label="카테고리 이름"
              maxLength={40}
              className="tdo-cat-rename"
              selectOnFocus
              onRename={(v) => void lists.rename(s.listId, v)}
              onClose={() => setRenaming(false)}
            />
          ) : (
            <span className="tdo-cat-name" style={{ color: tone.label }}>
              {s.name}
            </span>
          )}
          {view !== 'done' && (
            <button
              type="button"
              className="tdo-cat-add"
              aria-label={`${s.name}에 할 일 추가`}
              onClick={() => setAdding(true)}
            >
              <img src={plusUrl} alt="" draggable={false} />
            </button>
          )}
        </span>
        <span className="tdo-cat-tools">
          <button type="button" className="pg-pill" onClick={() => setRenaming(true)}>
            이름
          </button>
          {allLists.length > 1 && (
            <ConfirmButton
              key={s.listId}
              label="삭제"
              confirmLabel="할 일까지 지울까요?"
              onConfirm={() => lists.remove(s.listId)}
            />
          )}
        </span>
      </div>

      {adding && (
        <input
          className="pg-input tdo-add-input"
          autoFocus
          placeholder={addDue ? '할 일을 입력하고 Enter (이 날 마감)' : '할 일을 입력하고 Enter'}
          aria-label={`${s.name}에 새 할 일`}
          maxLength={200}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing)
              void commitAdd(e.currentTarget.value)
            if (e.key === 'Escape') {
              e.stopPropagation()
              setAdding(false)
            }
          }}
          onBlur={(e) => void commitAdd(e.currentTarget.value)}
        />
      )}

      {s.items.length > 0 && (
        <ul className="pg-list tdo-items">
          {s.items.map((i) => (
            <li key={i.id} className={`tdo-item ${i.id === openId ? 'is-open' : ''}`}>
              <div className="pg-row">
                <TodoCheck item={i} actions={actions} />
                <button
                  type="button"
                  className={`pg-row-main ${i.done ? 'is-done' : ''}`}
                  aria-expanded={i.id === openId}
                  onClick={() => onOpen(i.id === openId ? null : i.id)}
                >
                  <span className="pg-row-title">{i.title}</span>
                  {i.note && <span className="pg-row-note">{i.note}</span>}
                </button>
                {/* "이 날" 보기에서 고른 날 마감은 굳이 적지 않는다 */}
                {i.dueDate && !(view === 'day' && i.dueDate === date) && (
                  <span className={`pg-due ${isOverdue(i, today) ? 'is-overdue' : ''}`}>
                    {dueText(i.dueDate, today)}
                  </span>
                )}
              </div>
              {i.id === openId && (
                <ItemDetail
                  key={i.id}
                  item={i}
                  lists={allLists}
                  today={today}
                  actions={actions}
                  onClose={() => onOpen(null)}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** 할 일 상세(목록 안에서 펼침): 제목, 마감일, 카테고리, 메모, 삭제 */
function ItemDetail({
  item,
  lists,
  today,
  actions,
  onClose,
}: {
  item: TodoItem
  lists: readonly TodoList[]
  today: string
  actions: BoardActions
  onClose(): void
}) {
  const update = (patch: Parameters<BoardActions['todo']['update']>[1]) =>
    void actions.todo.update(item.id, patch)

  return (
    <div className="tdo-detail" aria-label="할 일 상세">
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
      <div className="tdo-detail-row">
        <label className="pg-field">
          <span>마감일</span>
          <input
            className="pg-input"
            type="date"
            value={item.dueDate ?? ''}
            onChange={(e) => update({ dueDate: e.target.value || null })}
          />
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
          <span>카테고리</span>
          <select
            className="pg-input"
            value={item.listId}
            onChange={(e) => update({ listId: e.target.value })}
          >
            {lists.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="pg-field">
        <span>메모</span>
        <textarea
          className="pg-input pg-note tdo-note"
          defaultValue={item.note}
          maxLength={2000}
          placeholder="메모를 남겨 보세요"
          onBlur={(e) => {
            if (e.currentTarget.value !== item.note) update({ note: e.currentTarget.value })
          }}
        />
      </label>
      <div className="pg-detail-actions">
        <ConfirmButton
          label="삭제"
          confirmLabel="정말 삭제"
          onConfirm={async () => {
            if (await actions.todo.remove(item.id)) onClose()
          }}
        />
        <span className="pg-spacer" />
        <button type="button" className="pg-pill" onClick={onClose}>
          닫기
        </button>
      </div>
    </div>
  )
}

function NewCategory({ lists }: { lists: UserData['lists'] }) {
  const [name, setName] = useState('')
  return (
    <form
      className="pg-add tdo-new-cat"
      onSubmit={async (e) => {
        e.preventDefault()
        const n = name.trim()
        if (n && (await lists.create(n))) setName('')
      }}
    >
      <span className="pg-add-plus" aria-hidden>
        +
      </span>
      <input
        className="pg-input"
        placeholder="새 카테고리"
        aria-label="새 카테고리 이름"
        maxLength={40}
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
    </form>
  )
}
