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
import { ItemDetail } from './CategoryList'
import { monthDay } from '../dateText'
import { dragRow, DropZone, type TodoDnd } from './dnd'
import { matchesQuery } from '../todoView'

/** 스프린트 보기: 진행 중 → 예정 → 끝남. 카드마다 기간·목표·진행률·안의 할 일 */
export function SprintList({
  sprints,
  items,
  lists,
  today,
  actions,
  api,
  dnd,
  query,
}: {
  sprints: readonly Sprint[]
  items: Readonly<Record<string, readonly TodoItem[]>>
  lists: readonly TodoList[]
  today: string
  actions: BoardActions
  api: UserData['sprints']
  dnd: TodoDnd
  /** 검색어: 스프린트 이름·목표가 맞으면 그 카드 전부, 아니면 맞는 할 일만 */
  query: string
}) {
  const [creating, setCreating] = useState(false)
  const q = query.trim()
  const shown = sortSprints(sprints, today).flatMap(
    (s): { s: Sprint; all: TodoItem[]; only: ReadonlySet<string> | null }[] => {
      const all = sprintItems(items, s.id)
      if (!q || matchesQuery({ title: s.name, note: s.goal }, q)) return [{ s, all, only: null }]
      const hit = all.filter((i) => matchesQuery(i, q))
      return hit.length > 0 ? [{ s, all, only: new Set(hit.map((i) => i.id)) }] : []
    },
  )
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
      {q && shown.length === 0 && <p className="pg-empty">찾는 스프린트나 할 일이 없어요</p>}
      {shown.map(({ s, all, only }) => (
        <SprintCard
          key={s.id}
          sprint={s}
          sprints={sprints}
          items={all}
          only={only}
          lists={lists}
          today={today}
          actions={actions}
          api={api}
          dnd={dnd}
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
  onSave(f: Fields): void | Promise<unknown>
  onCancel(): void
}) {
  // 저장 중에는 다시 보내지 않는다(Enter 두 번에 둘 생기지 않도록)
  const [saving, setSaving] = useState(false)
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
        // 정해진 칸만 보낸다(main은 모르는 항목이 섞이면 거부한다)
        if (!ok || saving) return
        setSaving(true)
        void Promise.resolve(
          onSave({
            name: f.name.trim(),
            goal: f.goal.trim(),
            startDate: f.startDate,
            endDate: f.endDate,
            color: f.color,
          }),
        ).finally(() => setSaving(false))
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
            {SPRINT_COLORS.map((c, n) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={f.color === c}
                aria-label={`색 ${n + 1}`}
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
        <button type="submit" className="pg-pill" disabled={!ok || saving}>
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
  sprints,
  items,
  lists,
  today,
  actions,
  api,
  dnd,
  only,
}: {
  sprint: Sprint
  /** 할 일 상세에서 다른 스프린트로 옮길 때 */
  sprints: readonly Sprint[]
  items: TodoItem[]
  lists: readonly TodoList[]
  today: string
  actions: BoardActions
  api: UserData['sprints']
  dnd: TodoDnd
  /** 검색에 맞는 할 일만 보일 때 그 id(진행률은 전체로 센다) */
  only: ReadonlySet<string> | null
}) {
  const status = sprintStatus(s, today)
  const [editing, setEditing] = useState(false)
  const [open, setOpen] = useState(status !== 'ended')
  const [showDone, setShowDone] = useState(false)
  const [adding, setAdding] = useState(false)
  const [addList, setAddList] = useState(lists[0]?.id ?? '')
  /** 펼친(고치는 중인) 할 일 */
  const [openId, setOpenId] = useState<string | null>(null)
  const p = sprintProgress(items)
  const visible = only ? items.filter((i) => only.has(i.id)) : items
  const remaining = visible.filter((i) => !i.done)
  const done = visible.filter((i) => i.done)
  const listName = (id: string) => lists.find((l) => l.id === id)?.name ?? ''

  if (editing)
    return (
      <SprintForm
        initial={{
          name: s.name,
          goal: s.goal,
          startDate: s.startDate,
          endDate: s.endDate,
          color: s.color,
        }}
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

  // 누르면 그 자리에서 펼쳐 고치고, 줄에 올리면 바로 지우기(두 번 누르기)
  const row = (i: TodoItem) => (
    <li key={i.id} className={`tdo-item ${i.id === openId ? 'is-open' : ''}`}>
      <div className="pg-row tdo-sprint-row" {...dragRow(dnd, i)}>
        <TodoCheck item={i} actions={actions} />
        <button
          type="button"
          className={`pg-row-main ${i.done ? 'is-done' : ''}`}
          aria-expanded={i.id === openId}
          onClick={() => setOpenId(i.id === openId ? null : i.id)}
        >
          <span className="pg-row-title">{i.title}</span>
          {i.note && <span className="pg-row-note">{i.note}</span>}
        </button>
        <span className="tdo-sprint-cat">{listName(i.listId)}</span>
        <ConfirmButton
          key={i.id}
          className="tdo-row-del"
          label="×"
          confirmLabel="지우기"
          onConfirm={() => actions.todo.remove(i.id)}
        />
      </div>
      {i.id === openId && (
        <ItemDetail
          key={i.id}
          item={i}
          lists={lists}
          sprints={sprints}
          today={today}
          actions={actions}
          onClose={() => setOpenId(null)}
        />
      )}
    </li>
  )

  return (
    <DropZone
      as="section"
      dnd={dnd}
      patchFor={(it) => (it.sprintId === s.id ? null : { sprintId: s.id })}
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
      {/* 검색 중에는 맞는 할 일이 보이도록 펼친다 */}
      {(open || only) && (
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
              {(showDone || only) && <ul className="pg-list">{done.map(row)}</ul>}
            </>
          )}
        </>
      )}
    </DropZone>
  )
}
