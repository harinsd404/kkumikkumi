import type { CalendarEvent, Memo, Timetable, TodoList } from '@kkumikkumi/schema'
import { useState } from 'react'
import { localDate } from '../../board/calendar'
import { ddayDateLabel, ddayOf } from '../../board/dday'
import { memoTitle } from '../../board/memoFormat'
import { useKeyedAsync } from '../../board/useKeyedAsync'
import { useMinuteClock } from '../../board/useMinuteClock'
import { Row } from '../fields'

// 블록이 보여 줄 사용자 데이터 고르기(메모, 시간표, 일정, 투두 목록)와 작은 입력들

export interface EventPickApi {
  get(id: string): Promise<CalendarEvent | null | undefined>
  upcoming(today: string, limit: number): Promise<CalendarEvent[]>
}

export interface TimetablePick {
  timetables: readonly Timetable[]
  /** 고른 시간표(따라가는 블록이 보여 줄 것) */
  activeId: string | null
}

export interface MemoPickApi {
  /** 처음 읽기 전에는 undefined */
  memos: readonly Memo[] | undefined
  create(): Promise<Memo | null>
}

export interface TodoListsApi {
  all: readonly TodoList[]
  create(name: string): Promise<TodoList | null>
  rename(id: string, name: string): Promise<boolean>
  remove(id: string): Promise<boolean>
}

/** 맨 위 '' 선택지(= null) + 목록. 고른 id가 지워졌으면(missing) '' 칸에 둔다. */
function IdSelect(props: {
  label: string
  value: string | null
  missing: boolean
  emptyLabel: string
  options: readonly { id: string; label: string }[]
  onSelect(id: string | null): void
}) {
  return (
    <Row label={props.label}>
      <select
        className="ki-select"
        value={props.missing ? '' : (props.value ?? '')}
        onChange={(e) => props.onSelect(e.target.value || null)}
      >
        <option value="">{props.emptyLabel}</option>
        {props.options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </Row>
  )
}

/** 메모 블록이 보여 줄 메모 고르기 + 새 메모 */
export function MemoFields({
  api,
  memoId,
  onSelect,
}: {
  api: MemoPickApi
  memoId: string | null
  onSelect(memoId: string | null): void
}) {
  const all = api.memos ?? []
  const missing = memoId !== null && api.memos !== undefined && !all.some((m) => m.id === memoId)
  return (
    <>
      <IdSelect
        label="메모"
        value={memoId}
        missing={missing}
        emptyLabel={missing ? '지워진 메모' : '고르지 않음'}
        options={all.map((m) => ({ id: m.id, label: memoTitle(m.body, 30) || '새 메모' }))}
        onSelect={onSelect}
      />
      <div className="ki-buttons">
        <button
          type="button"
          onClick={async () => {
            const m = await api.create()
            if (m) onSelect(m.id)
          }}
        >
          새 메모 만들어 연결
        </button>
      </div>
    </>
  )
}

/** 시간표 블록이 보여 줄 시간표: 고른 시간표 따라가기 또는 특정 시간표로 고정 */
export function TimetableFields({
  pick,
  timetableId,
  onSelect,
}: {
  pick: TimetablePick
  timetableId: string | null
  onSelect(timetableId: string | null): void
}) {
  const missing = timetableId !== null && !pick.timetables.some((t) => t.id === timetableId)
  const active = pick.timetables.find((t) => t.id === pick.activeId)
  return (
    <>
      <IdSelect
        label="보여 줄 시간표"
        value={timetableId}
        missing={missing}
        emptyLabel={active ? `고른 시간표 따라가기 (지금: ${active.name})` : '고른 시간표 따라가기'}
        options={pick.timetables.map((t) => ({ id: t.id, label: `${t.name}만` }))}
        onSelect={onSelect}
      />
      {missing && <p className="ki-note">고정했던 시간표가 지워져서 고른 시간표를 보여 줘요.</p>}
    </>
  )
}

/** 디데이 블록이 보여 줄 일정: 자동(가장 가까운 일정) 또는 다가오는 일정 중 하나로 고정 */
export function DdayFields({
  api,
  eventId,
  onSelect,
}: {
  api: EventPickApi
  eventId: string | null
  onSelect(eventId: string | null): void
}) {
  const today = localDate(useMinuteClock().getTime())
  const cur =
    useKeyedAsync(`${eventId ?? ''}|${today}`, async () => {
      const [list, pinned] = await Promise.all([
        api.upcoming(today, 50),
        eventId ? api.get(eventId) : null,
      ])
      return { list, pinned }
    }) ?? null
  // 고정한 일정이 지났으면 목록에 없으니 맨 위에 따로 넣는다
  const events =
    cur?.pinned && !cur.list.some((e) => e.id === cur.pinned!.id)
      ? [cur.pinned, ...cur.list]
      : (cur?.list ?? [])
  const missing = eventId !== null && cur !== null && cur.pinned === null
  const options = events.map((e) => ({
    id: e.id,
    label: `${ddayOf(e, today).label} · ${e.title} · ${ddayDateLabel(e)}`,
  }))
  return (
    <>
      <IdSelect
        label="보여 줄 일정"
        value={eventId}
        missing={missing}
        emptyLabel="가장 가까운 일정 (자동)"
        options={eventId && !cur ? [{ id: eventId, label: '불러오는 중…' }] : options}
        onSelect={onSelect}
      />
      {cur && cur.list.length === 0 && !cur.pinned && (
        <p className="ki-note">다가오는 일정이 없어요.</p>
      )}
      {missing && <p className="ki-note">고정했던 일정이 지워졌어요. 다른 일정을 골라 주세요.</p>}
    </>
  )
}

/** 투두 블록이 보여 줄 목록 고르기 + 목록 추가/이름 변경/삭제 */
export function TodoListFields({
  lists,
  listId,
  onSelect,
}: {
  lists: TodoListsApi
  listId: string | null
  onSelect(listId: string | null): void
}) {
  const current = lists.all.find((l) => l.id === listId) ?? null
  const [newName, setNewName] = useState('')
  const [rename, setRename] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const shown = current ?? lists.all[0] ?? null

  return (
    <>
      <Row label="목록">
        <select
          className="ki-select"
          value={current?.id ?? ''}
          onChange={(e) => {
            setConfirmDelete(false)
            setRename(null)
            onSelect(e.target.value || null)
          }}
        >
          <option value="">기본 목록{lists.all[0] ? ` (${lists.all[0].name})` : ''}</option>
          {lists.all.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </Row>
      {shown && (
        <Row label="이름">
          <input
            className="ki-text"
            value={rename ?? shown.name}
            maxLength={40}
            onChange={(e) => setRename(e.target.value)}
            onBlur={() => {
              const name = rename?.trim()
              if (name && name !== shown.name) void lists.rename(shown.id, name)
              setRename(null)
            }}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          />
        </Row>
      )}
      <form
        className="ki-row"
        onSubmit={async (e) => {
          e.preventDefault()
          const name = newName.trim()
          if (!name) return
          const l = await lists.create(name)
          if (l) {
            setNewName('')
            onSelect(l.id)
          }
        }}
      >
        <input
          className="ki-text"
          placeholder="새 목록 이름"
          aria-label="새 목록 이름"
          value={newName}
          maxLength={40}
          onChange={(e) => setNewName(e.target.value)}
        />
        <button type="submit" className="ki-small">
          추가
        </button>
      </form>
      {current && lists.all.length > 1 && (
        <div className="ki-buttons">
          <button
            type="button"
            className="is-danger"
            onClick={async () => {
              if (!confirmDelete) return setConfirmDelete(true)
              setConfirmDelete(false)
              if (await lists.remove(current.id)) onSelect(null)
            }}
          >
            {confirmDelete ? '한 번 더 누르면 목록과 할 일이 지워져요' : '이 목록 삭제'}
          </button>
        </div>
      )}
    </>
  )
}

/** 타이머 프리셋(분): 1~180, 최대 6개, 최소 1개 */
export function PresetFields({
  presets,
  onChange,
}: {
  presets: readonly number[]
  onChange(v: number[]): void
}) {
  const [draft, setDraft] = useState('')
  const add = () => {
    const n = Math.round(Number(draft))
    if (!Number.isFinite(n) || n < 1 || n > 180 || presets.includes(n)) return
    onChange([...presets, n].sort((a, b) => a - b))
    setDraft('')
  }
  return (
    <div className="ki-row ki-presets">
      <span className="ki-label">프리셋</span>
      <span className="ki-chips">
        {presets.map((m) => (
          <button
            key={m}
            type="button"
            className="ki-chip"
            disabled={presets.length <= 1}
            aria-label={`${m}분 프리셋 지우기`}
            onClick={() => onChange(presets.filter((x) => x !== m))}
          >
            {m}분 ×
          </button>
        ))}
        {presets.length < 6 && (
          <input
            className="ki-num"
            type="number"
            min={1}
            max={180}
            placeholder="분"
            aria-label="프리셋 추가(분)"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                add()
              }
            }}
            onBlur={add}
          />
        )}
      </span>
    </div>
  )
}

export function Actions({ onDuplicate, onDelete }: { onDuplicate(): void; onDelete(): void }) {
  return (
    <div className="ki-buttons ki-actions">
      <button type="button" onClick={onDuplicate}>
        복제 <kbd>⌘D</kbd>
      </button>
      <button type="button" className="is-danger" onClick={onDelete}>
        삭제 <kbd>⌫</kbd>
      </button>
    </div>
  )
}
