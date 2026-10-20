import type { Sprint, TodoItem, TodoList } from '@kkumikkumi/schema'
import { useState } from 'react'
import type { BoardActions } from '../../board/BoardContext'
import { addDays } from '../../board/calendar'
import {
  SPRINT_COLORS,
  sortSprints,
  sprintBadge,
  sprintItems,
  sprintProgress,
  sprintStatus,
} from '../../board/sprint'
import type { UserData } from '../../app/useUserData'
import { ConfirmButton } from '../../ui/ConfirmButton'
import { TodoCheck } from '../../ui/TodoCheck'
import { monthDay } from '../dateText'

/** 스프린트 보기: 진행 중 → 예정 → 끝남. 카드마다 기간·목표·진행률·안의 할 일 */
export function SprintList({
  sprints,
  items,
  lists,
  today,
  actions,
  api,
}: {
  sprints: readonly Sprint[]
  items: Readonly<Record<string, readonly TodoItem[]>>
  lists: readonly TodoList[]
  today: string
  actions: BoardActions
  api: UserData['sprints']
}) {
  const [creating, setCreating] = useState(false)
  return (
    <div className="tdo-sprints">
      {creating ? (
        <SprintForm
          today={today}
          onSave={async (f) => {
            if (await api.create(f)) setCreating(false)
          }}
          onCancel={() => setCreating(false)}
        />
      ) : (
        <button
          type="button"
          className="tdo-cat-chip tdo-new-cat"
          onClick={() => setCreating(true)}
        >
          + 새 스프린트
        </button>
      )}
      {sprints.length === 0 && !creating && (
        <p className="pg-empty">
          "중간고사 대비 · 2주"처럼 기간을 정하고, 그동안 끝낼 할 일을 모아 보세요.
        </p>
      )}
      {sortSprints(sprints, today).map((s) => (
        <SprintCard
          key={s.id}
          sprint={s}
          items={sprintItems(items, s.id)}
          lists={lists}
          today={today}
          actions={actions}
          api={api}
        />
      ))}
    </div>
  )
}

type Fields = { name: string; goal: string; startDate: string; endDate: string; color: string }

function SprintForm({
  initial,
  today,
  onSave,
  onCancel,
}: {
  initial?: Fields
  today: string
  onSave(f: Fields): void
  onCancel(): void
}) {
  const [f, setF] = useState<Fields>(
    initial ?? {
      name: '',
      goal: '',
      startDate: today,
      endDate: addDays(today, 13),
      color: SPRINT_COLORS[0]!,
    },
  )
  const set = (patch: Partial<Fields>) => setF((x) => ({ ...x, ...patch }))
  const ok = f.name.trim() !== '' && f.startDate <= f.endDate
  return (
    <form
      className="tdo-sprint tdo-sprint-form"
      onSubmit={(e) => {
        e.preventDefault()
        if (ok) onSave({ ...f, name: f.name.trim(), goal: f.goal.trim() })
      }}
    >
      <input
        className="pg-input tdo-sprint-name-input"
        placeholder="스프린트 이름 (예: 중간고사 대비)"
        aria-label="스프린트 이름"
        maxLength={40}
        autoFocus
        value={f.name}
        onChange={(e) => set({ name: e.target.value })}
      />
      <div className="tdo-detail-row">
        <label className="pg-field">
          <span>시작</span>
          <input
            className="pg-input"
            type="date"
            value={f.startDate}
            onChange={(e) =>
              e.target.value &&
              set({
                startDate: e.target.value,
                endDate: f.endDate < e.target.value ? e.target.value : f.endDate,
              })
            }
          />
        </label>
        <label className="pg-field">
          <span>끝 (그날 포함)</span>
          <input
            className="pg-input"
            type="date"
            value={f.endDate}
            min={f.startDate}
            onChange={(e) => e.target.value && set({ endDate: e.target.value })}
          />
        </label>
        <div className="pg-field">
          <span>색</span>
          <div className="tdo-sprint-colors" role="radiogroup" aria-label="스프린트 색">
            {SPRINT_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={f.color === c}
                aria-label={c}
                style={{ background: c }}
                onClick={() => set({ color: c })}
              />
            ))}
          </div>
        </div>
      </div>
      <input
        className="pg-input"
        placeholder="목표 (선택)"
        aria-label="목표"
        maxLength={200}
        value={f.goal}
        onChange={(e) => set({ goal: e.target.value })}
      />
      <div className="pg-detail-actions">
        <button type="submit" className="pg-pill" disabled={!ok}>
          {initial ? '저장' : '만들기'}
        </button>
        <button type="button" className="pg-pill" onClick={onCancel}>
          취소
        </button>
      </div>
    </form>
  )
}

function SprintCard({
  sprint: s,
  items,
  lists,
  today,
  actions,
  api,
}: {
  sprint: Sprint
  items: TodoItem[]
  lists: readonly TodoList[]
  today: string
  actions: BoardActions
  api: UserData['sprints']
}) {
  const status = sprintStatus(s, today)
  const [editing, setEditing] = useState(false)
  const [open, setOpen] = useState(status !== 'ended')
  const [showDone, setShowDone] = useState(false)
  const [adding, setAdding] = useState(false)
  const [addList, setAddList] = useState(lists[0]?.id ?? '')
  const p = sprintProgress(items)
  const remaining = items.filter((i) => !i.done)
  const done = items.filter((i) => i.done)
  const listName = (id: string) => lists.find((l) => l.id === id)?.name ?? ''

  if (editing)
    return (
      <SprintForm
        initial={{ ...s }}
        today={today}
        onSave={async (f) => {
          if (await api.update(s.id, f)) setEditing(false)
        }}
        onCancel={() => setEditing(false)}
      />
    )

  const commitAdd = async (title: string) => {
    const t = title.trim()
    setAdding(false)
    const listId = lists.some((l) => l.id === addList) ? addList : lists[0]?.id
    if (t && listId) await actions.todo.create(listId, t, null, s.id)
  }

  const row = (i: TodoItem) => (
    <li key={i.id} className="pg-row">
      <TodoCheck item={i} actions={actions} />
      <span className={`pg-row-main tdo-sprint-item ${i.done ? 'is-done' : ''}`}>
        <span className="pg-row-title">{i.title}</span>
      </span>
      <span className="tdo-sprint-cat">{listName(i.listId)}</span>
    </li>
  )

  return (
    <section
      className={`tdo-sprint is-${status}`}
      style={{ borderLeftColor: s.color }}
      aria-label={s.name}
    >
      <div className="tdo-sprint-head">
        <button
          type="button"
          className="tdo-sprint-title"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          <span className="tdo-sprint-dot" style={{ background: s.color }} />
          {s.name}
        </button>
        <span className="tdo-sprint-badge">{sprintBadge(s, today)}</span>
        <span className="tdo-sprint-range">
          {monthDay(s.startDate)} ~ {monthDay(s.endDate)}
        </span>
        <span className="pg-spacer" />
        <span className="tdo-cat-tools">
          <button type="button" className="pg-pill" onClick={() => setEditing(true)}>
            수정
          </button>
          <ConfirmButton
            key={s.id}
            label="삭제"
            confirmLabel="할 일은 남기고 지울까요?"
            onConfirm={() => api.remove(s.id)}
          />
        </span>
      </div>
      {s.goal && <p className="tdo-sprint-goal">{s.goal}</p>}
      <div className="tdo-sprint-progress">
        <span className="tdo-sprint-track">
          <span style={{ width: `${p.ratio * 100}%`, background: s.color }} />
        </span>
        <span className="tdo-sprint-count">
          {p.done} / {p.total} 끝냄
        </span>
      </div>
      {open && (
        <>
          {remaining.length > 0 && <ul className="pg-list">{remaining.map(row)}</ul>}
          {adding ? (
            <div className="tdo-sprint-add">
              <select
                className="pg-input"
                aria-label="카테고리"
                value={addList}
                onChange={(e) => setAddList(e.target.value)}
              >
                {lists.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
              <input
                className="pg-input"
                autoFocus
                placeholder="할 일을 입력하고 Enter"
                aria-label={`${s.name}에 할 일 추가`}
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
            </div>
          ) : (
            status !== 'ended' && (
              <button type="button" className="tdo-sprint-more" onClick={() => setAdding(true)}>
                + 할 일
              </button>
            )
          )}
          {done.length > 0 && (
            <>
              <button
                type="button"
                className="tdo-sprint-more"
                aria-expanded={showDone}
                onClick={() => setShowDone(!showDone)}
              >
                끝낸 일 {done.length}개 {showDone ? '접기' : '보기'}
              </button>
              {showDone && <ul className="pg-list">{done.map(row)}</ul>}
            </>
          )}
        </>
      )}
    </section>
  )
}
