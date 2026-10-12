import type { CalendarEvent, Theme } from '@kkumikkumi/schema'
import { useEffect, useId, useRef, useState } from 'react'
import checkUrl from '../board/icons/check.svg'
import {
  eventToForm,
  formToEvent,
  systemTimeZone,
  type EventForm,
  type EventInput,
} from '../board/calendar'
import { themeVars } from './themeVars'

interface Props {
  target: { date: string } | { event: CalendarEvent }
  /** 팔레트/폰트를 보드와 맞춘다 */
  theme: Theme
  onCreate(e: EventInput): Promise<boolean>
  onUpdate(id: string, e: EventInput): Promise<boolean>
  onDelete(id: string): Promise<boolean>
  onClose(): void
}

/** 일정 추가/수정 창. 보드 축소와 상관없이 읽기 쉬운 크기로 앱 레이어에 띄운다. */
export function EventDialog({ target, theme, onCreate, onUpdate, onDelete, onClose }: Props) {
  const existing = 'event' in target ? target.event : null
  const palette = theme.defaults.palette
  const colors = [
    palette.accent,
    palette.check,
    palette.text,
    palette.subText,
    '#e76f51',
    '#4f86c6',
  ]
  const [form, setForm] = useState<EventForm>(() =>
    existing
      ? eventToForm(existing)
      : {
          title: '',
          allDay: true,
          startDate: 'date' in target ? target.date : '',
          endDate: 'date' in target ? target.date : '',
          startTime: '09:00',
          endTime: '10:00',
          color: palette.accent,
          note: '',
        },
  )
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
          <div className="dlg-swatches" role="radiogroup" aria-label="색">
            {colors.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={form.color.toLowerCase() === c.toLowerCase()}
                aria-label={c}
                className="dlg-swatch"
                style={{ background: c }}
                onClick={() => set({ color: c })}
              />
            ))}
          </div>
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
