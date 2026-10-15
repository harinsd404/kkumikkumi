import type { TimetableEntry, TimetableSettings, TimetableSlot } from '@kkumikkumi/schema'
import { useEffect, useRef, useState } from 'react'
import { cellEntry, DAY_LABEL, entryColor, TONE_ROWS } from '../../board/timetable'
import type { TimetableStore } from '../../app/useTimetable'
import type { Colors, Sel } from './common'

/** 오른쪽 편집 패널. 교시 칸은 Enter로 저장하고 다음 요일 칸으로 넘어간다. */
export function EntryEditor({
  store,
  timetableId,
  entries,
  colors,
  settings: s,
  sel,
  days,
  onSelect,
}: {
  store: TimetableStore
  timetableId: string
  entries: readonly TimetableEntry[]
  colors: Colors
  settings: TimetableSettings
  sel: Sel
  days: number[]
  onSelect(sel: Sel | null): void
}) {
  const entry =
    sel.kind === 'cell'
      ? cellEntry(entries, sel.day, sel.period)
      : sel.kind === 'entry'
        ? entries.find((e) => e.id === sel.id)
        : undefined
  const initialSlot: TimetableSlot | null =
    sel.kind === 'cell'
      ? { kind: 'period', day: sel.day, period: sel.period }
      : sel.kind === 'new'
        ? sel.slot
        : (entry?.slot ?? null)

  const [subject, setSubject] = useState(entry?.subject ?? '')
  const [room, setRoom] = useState(entry?.room ?? '')
  const [tone, setTone] = useState<number | null>(entry?.tone ?? null)
  const [slot, setSlot] = useState<TimetableSlot | null>(initialSlot)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const subjectRef = useRef<HTMLInputElement>(null)

  useEffect(() => subjectRef.current?.focus(), [])

  if (!slot) return null // 지워진 항목
  const isPeriod = slot.kind === 'period'

  /** 다음 칸: 같은 교시 다음 요일 → 다음 교시 첫 요일 */
  const nextCell = (): Sel | null => {
    if (slot.kind !== 'period') return null
    const di = days.indexOf(slot.day)
    if (di < days.length - 1) return { kind: 'cell', day: days[di + 1]!, period: slot.period }
    if (slot.period < s.periods.length)
      return { kind: 'cell', day: days[0]!, period: slot.period + 1 }
    return null
  }

  const save = async () => {
    const content = { subject: subject.trim(), room: room.trim(), tone }
    if (!content.subject) {
      if (isPeriod && entry) {
        // 과목을 지우고 저장 = 칸 비우기
        setBusy(true)
        const ok = await store.remove(entry.id)
        setBusy(false)
        if (ok) onSelect(nextCell()) // 실패하면 이 칸에 머문다(안내는 store가 띄운다)
        return
      }
      return setError('과목을 입력해 주세요')
    }
    if (slot.kind === 'time' && slot.start >= slot.end)
      return setError('끝 시각이 시작보다 뒤여야 해요')
    setBusy(true)
    if (entry) {
      const ok = await store.update(entry.id, { content, ...(isPeriod ? {} : { slot }) })
      setBusy(false)
      if (ok) onSelect(isPeriod ? nextCell() : { kind: 'entry', id: entry.id })
    } else {
      const created = await store.create(timetableId, slot, content)
      setBusy(false)
      if (created) onSelect(isPeriod ? nextCell() : { kind: 'entry', id: created.id })
    }
  }

  const period = slot.kind === 'period' ? s.periods[slot.period - 1] : undefined

  return (
    <form
      className="tt-editor"
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
    >
      <h2 className="pg-chip">
        {slot.kind === 'period'
          ? `${DAY_LABEL[slot.day]} ${slot.period}교시`
          : entry
            ? '수업 고치기'
            : '새 수업'}
      </h2>
      {period && (
        <p className="tt-sub">
          {period.start}–{period.end}
        </p>
      )}
      <label className="pg-field">
        <span>과목</span>
        <input
          ref={subjectRef}
          className="pg-input"
          value={subject}
          maxLength={40}
          placeholder={isPeriod ? '비워 두고 저장하면 칸 비우기' : '과목 이름'}
          onChange={(e) => {
            setSubject(e.target.value)
            setError(null)
          }}
        />
      </label>
      <label className="pg-field">
        <span>교실 (선택)</span>
        <input
          className="pg-input"
          value={room}
          maxLength={40}
          onChange={(e) => setRoom(e.target.value)}
        />
      </label>
      {slot.kind === 'time' && (
        <>
          <label className="pg-field">
            <span>요일</span>
            <select
              className="pg-input"
              value={slot.day}
              onChange={(e) => setSlot({ ...slot, day: Number(e.target.value) })}
            >
              {[0, 1, 2, 3, 4, 5, 6].map((d) => (
                <option key={d} value={d}>
                  {DAY_LABEL[d]}요일
                </option>
              ))}
            </select>
          </label>
          <div className="pg-field-row">
            <label className="pg-field">
              <span>시작</span>
              <input
                className="pg-input"
                type="time"
                value={slot.start}
                onChange={(e) => e.target.value && setSlot({ ...slot, start: e.target.value })}
              />
            </label>
            <label className="pg-field">
              <span>끝</span>
              <input
                className="pg-input"
                type="time"
                value={slot.end}
                onChange={(e) => e.target.value && setSlot({ ...slot, end: e.target.value })}
              />
            </label>
          </div>
        </>
      )}
      <div className="pg-field">
        <span>색 (테마 색에서)</span>
        <div className="tt-swatches" role="radiogroup" aria-label="색">
          <button
            type="button"
            role="radio"
            aria-checked={tone === null}
            className="tt-swatch is-auto"
            style={{ background: entryColor({ subject, tone: null }, colors.auto, colors.tones) }}
            onClick={() => setTone(null)}
          >
            자동
          </button>
          {TONE_ROWS.map((row, ri) => (
            <div key={ri} className="tt-swatch-row">
              {row.map((i) => (
                <button
                  key={i}
                  type="button"
                  role="radio"
                  aria-checked={tone === i}
                  aria-label={`${ri === 0 ? '강조색' : '체크색'} 톤 ${row.indexOf(i) + 1}`}
                  className="tt-swatch"
                  style={{ background: colors.tones[i] }}
                  onClick={() => setTone(i)}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      {error && (
        <p className="tt-error" role="alert">
          {error}
        </p>
      )}
      <div className="pg-detail-actions">
        <button type="submit" className="pg-pill is-filled" disabled={busy}>
          저장{isPeriod ? ' ↵' : ''}
        </button>
        {entry && (
          <button
            type="button"
            className="pg-pill is-danger"
            disabled={busy}
            onClick={async () => {
              if (await store.remove(entry.id)) onSelect(null)
            }}
          >
            {isPeriod ? '비우기' : '삭제'}
          </button>
        )}
        <span className="pg-spacer" />
        <button type="button" className="pg-pill" onClick={() => onSelect(null)}>
          닫기
        </button>
      </div>
    </form>
  )
}
