import type { Theme } from '@kkumikkumi/schema'
import { useEffect, useId, useRef, useState } from 'react'
import checkUrl from '../board/icons/check.svg'
import {
  eventToForm,
  formToEvent,
  systemTimeZone,
  type EventForm,
  type EventInput,
} from '../board/calendar'
import type { EditorTarget } from '../board/BoardContext'
import { addMinutesToTime } from '../pages/calendarView'
import { colorGroups, type ThemeColors } from './colorGroups'
import { Swatches } from './Swatches'
import { themeVars } from './themeVars'

interface Props {
  target: EditorTarget
  /** 팔레트/폰트를 보드와 맞춘다 */
  theme: Theme
  /** 색 고르기에 함께 보여 줄 다른 테마들 */
  otherThemes: readonly ThemeColors[]
  onCreate(e: EventInput): Promise<boolean>
  onUpdate(id: string, e: EventInput): Promise<boolean>
  onDelete(id: string): Promise<boolean>
  onClose(): void
}

/** 일정 추가/수정 창. 보드 축소와 상관없이 읽기 쉬운 크기로 앱 레이어에 띄운다. */
export function EventDialog({
  target,
  theme,
  otherThemes,
  onCreate,
  onUpdate,
  onDelete,
  onClose,
}: Props) {
  const existing = 'event' in target ? target.event : null
  const palette = theme.defaults.palette
  const swatches = colorGroups(
    {
      name: theme.name,
      palette,
      bgColor: theme.background.type === 'color' ? theme.background.color : null,
    },
    otherThemes,
  )
  const [form, setForm] = useState<EventForm>(() => {
    if (existing) return eventToForm(existing)
    const date = 'date' in target ? target.date : ''
    const time = 'date' in target ? target.time : undefined
    // 시간 칸에서 열었으면 그 시각부터 1시간짜리 시각 일정
    const end = addMinutesToTime(date, time ?? '09:00', 60)
    return {
      title: '',
      allDay: time === undefined,
      startDate: date,
      endDate: time === undefined ? date : end.date,
      startTime: time ?? '09:00',
      endTime: end.time,
      color: palette.accent,
      note: '',
    }
  })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const titleRef = useRef<HTMLInputElement>(null)
  const id = useId()

  useEffect(() => {
    titleRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const set = (patch: Partial<EventForm>) => {
    setError(null)
    setForm((f) => {
      const next = { ...f, ...patch }
      // 시작을 끝보다 뒤로 옮기면 끝을 따라오게 한다
      if (patch.startDate && next.endDate < next.startDate) next.endDate = next.startDate
      return next
    })
  }

  const submit = async () => {
    const r = formToEvent(form, existing && !existing.allDay ? existing.tzid : systemTimeZone())
    if (!r.ok) return setError(r.error)
    setBusy(true)
    const ok = existing ? await onUpdate(existing.id, r.event) : await onCreate(r.event)
    setBusy(false)
    if (ok) onClose()
  }

  return (
    <div className="dlg-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <form
        className="dlg"
        style={themeVars(theme)}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-t`}
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <h2 id={`${id}-t`} className="dlg-title">
          {existing ? '일정 고치기' : '일정 추가'}
        </h2>
        <label className="dlg-field">
          <span>제목</span>
          <input
            ref={titleRef}
            value={form.title}
            maxLength={200}
            onChange={(e) => set({ title: e.target.value })}
          />
        </label>
        <label className="dlg-check">
          <input
            type="checkbox"
            className="sr-only"
            checked={form.allDay}
            onChange={(e) => set({ allDay: e.target.checked })}
          />
          <span className="dlg-box" aria-hidden>
            {form.allDay && <img src={checkUrl} alt="" draggable={false} />}
          </span>
          <span>종일</span>
        </label>
        <div className="dlg-row">
          <label className="dlg-field">
            <span>시작</span>
            <input
              type="date"
              value={form.startDate}
              onChange={(e) => set({ startDate: e.target.value })}
            />
          </label>
          {!form.allDay && (
            <label className="dlg-field">
              <span className="sr-only">시작 시각</span>
              <input
                type="time"
                value={form.startTime}
                onChange={(e) => set({ startTime: e.target.value })}
              />
            </label>
          )}
        </div>
        <div className="dlg-row">
          <label className="dlg-field">
            <span>끝</span>
            <input
              type="date"
              value={form.endDate}
              min={form.startDate}
              onChange={(e) => set({ endDate: e.target.value })}
            />
          </label>
          {!form.allDay && (
            <label className="dlg-field">
              <span className="sr-only">끝 시각</span>
              <input
                type="time"
                value={form.endTime}
                onChange={(e) => set({ endTime: e.target.value })}
              />
            </label>
          )}
        </div>
        <div className="dlg-field">
          <span>색</span>
          <Swatches
            groups={swatches}
            value={form.color}
            onPick={(c) => set({ color: c })}
            size="large"
          />
        </div>
        <label className="dlg-field">
          <span>메모</span>
          <textarea
            rows={3}
            maxLength={2000}
            value={form.note}
            onChange={(e) => set({ note: e.target.value })}
          />
        </label>
        {error && (
          <p className="dlg-error" role="alert">
            {error}
          </p>
        )}
        <div className="dlg-actions">
          {existing && (
            <button
              type="button"
              className="is-danger"
              disabled={busy}
              onClick={async () => {
                setBusy(true)
                if (await onDelete(existing.id)) onClose()
                setBusy(false)
              }}
            >
              삭제
            </button>
          )}
          <span className="dlg-spacer" />
          <button type="button" onClick={onClose}>
            취소
          </button>
          <button type="submit" className="is-primary" disabled={busy}>
            저장
          </button>
        </div>
      </form>
    </div>
  )
}
