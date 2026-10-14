import type { TimetableEntry, TimetableSettings, TimetableSlot } from '@kkumikkumi/schema'
import { useEffect, useRef, useState, type MouseEvent } from 'react'
import './pages.css'
import {
  cellEntry,
  currentPeriod,
  DAY_LABEL,
  dayItems,
  entryColor,
  fromMin,
  hourRange,
  isNow,
  layoutColumns,
  minuteOfDay,
  nextPeriodTime,
  SUBJECT_COLORS,
  autoColors,
  visibleDays,
  weekdayOf,
} from '../board/timetable'
import type { TimetableStore } from '../app/useTimetable'

interface Props {
  store: TimetableStore
  now: Date
}

/** 고른 것: 교시 칸 / 시간 항목 / 아직 저장 안 한 새 시간 항목 */
type Sel =
  | { kind: 'cell'; day: number; period: number }
  | { kind: 'entry'; id: string }
  | { kind: 'new'; slot: Extract<TimetableSlot, { kind: 'time' }> }

const HOUR_PX = 56
const SNAP_MIN = 30

/** 시간표 세부 페이지: 교시 표 또는 요일×시각 표 / 오른쪽에서 칸 편집·교시 시각 설정 */
export function TimetablePage({ store, now }: Props) {
  const [sel, setSel] = useState<Sel | null>(null)
  const data = store.data
  if (!data) return <div className="pg" />
  const { settings: s, entries } = data
  const days = visibleDays(s)
  const today = weekdayOf(now)
  const minute = minuteOfDay(now)
  // 자동 색은 방식마다 따로(교시 과목이 시간 방식 색 차례를 차지하지 않게)
  const auto = autoColors(entries.filter((e) => e.slot.kind === s.mode))

  const setMode = (mode: TimetableSettings['mode']) => {
    setSel(null)
    void store.updateSettings({ mode })
  }

  return (
    <div className="pg pg-tt">
      <section className="pg-card tt-main" aria-label="시간표">
        <header className="pg-head">
          <h1 className="pg-title">시간표</h1>
          <div className="pg-tabs" role="tablist" aria-label="방식">
            {(
              [
                ['period', '교시'],
                ['time', '시간'],
              ] as const
            ).map(([m, label]) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={s.mode === m}
                className="pg-pill"
                onClick={() => setMode(m)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="pg-tabs" aria-label="주말">
            {(['showSat', 'showSun'] as const).map((k) => (
              <button
                key={k}
                type="button"
                className="pg-pill"
                aria-pressed={s[k]}
                onClick={() => void store.updateSettings({ [k]: !s[k] })}
              >
                {k === 'showSat' ? '토' : '일'}
              </button>
            ))}
          </div>
        </header>
        {s.mode === 'period' ? (
          <PeriodGrid
            auto={auto}
            settings={s}
            entries={entries}
            days={days}
            today={today}
            minute={minute}
            sel={sel}
            onSelect={setSel}
          />
        ) : (
          <TimeGrid
            auto={auto}
            settings={s}
            entries={entries}
            days={days}
            today={today}
            minute={minute}
            sel={sel}
            onSelect={setSel}
          />
        )}
      </section>

      <aside className="pg-card tt-side" aria-label="편집">
        {sel ? (
          <EntryEditor
            key={JSON.stringify(sel)}
            store={store}
            auto={auto}
            settings={s}
            sel={sel}
            days={days}
            onSelect={setSel}
          />
        ) : s.mode === 'period' ? (
          <PeriodTimes
            // 저장된 교시가 바뀌면 고치던 내용을 새로 시작
            key={JSON.stringify(s.periods)}
            store={store}
            settings={s}
            entries={entries}
          />
        ) : (
          <div className="tt-help">
            <h2 className="pg-chip">시간 방식</h2>
            <p className="pg-empty">빈 곳을 두 번 누르면 그 시각에 수업을 추가해요.</p>
            <button
              type="button"
              className="pg-pill is-filled"
              onClick={() =>
                setSel({
                  kind: 'new',
                  slot: {
                    kind: 'time',
                    day: days.includes(today) ? today : 0,
                    start: '09:00',
                    end: '10:00',
                  },
                })
              }
            >
              + 수업 추가
            </button>
          </div>
        )}
      </aside>
    </div>
  )
}

interface GridProps {
  auto: ReadonlyMap<string, string>
  settings: TimetableSettings
  entries: readonly TimetableEntry[]
  days: number[]
  today: number
  minute: number
  sel: Sel | null
  onSelect(sel: Sel | null): void
}

function DayHead({ day, today }: { day: number; today: number }) {
  return (
    <div className={`tt-dayhead ${day === today ? 'is-today' : ''}`} role="columnheader">
      {DAY_LABEL[day]}
    </div>
  )
}

function PeriodGrid({ auto, settings: s, entries, days, today, minute, sel, onSelect }: GridProps) {
  const nowPeriod = currentPeriod(s.periods, minute)
  return (
    <div
      className="tt-table"
      role="grid"
      style={{ gridTemplateColumns: `72px repeat(${days.length}, minmax(0, 1fr))` }}
    >
      <div />
      {days.map((d) => (
        <DayHead key={d} day={d} today={today} />
      ))}
      {s.periods.map((p, i) => (
        <PeriodRow
          key={i}
          period={i + 1}
          time={p}
          days={days}
          entries={entries}
          auto={auto}
          isNowRow={nowPeriod === i}
          today={today}
          sel={sel}
          onSelect={onSelect}
        />
      ))}
    </div>
  )
}

function PeriodRow(props: {
  period: number
  time: { start: string; end: string }
  days: number[]
  entries: readonly TimetableEntry[]
  auto: ReadonlyMap<string, string>
  isNowRow: boolean
  today: number
  sel: Sel | null
  onSelect(sel: Sel): void
}) {
  const { period, time, days, entries, sel } = props
  return (
    <>
      <div className="tt-rowhead" role="rowheader">
        <strong>{period}교시</strong>
        <span>{time.start}</span>
      </div>
      {days.map((d) => {
        const e = cellEntry(entries, d, period)
        const selected = sel?.kind === 'cell' && sel.day === d && sel.period === period
        const now = props.isNowRow && d === props.today
        return (
          <button
            key={d}
            type="button"
            role="gridcell"
            className={`tt-cell ${e ? 'is-filled' : ''} ${selected ? 'is-selected' : ''} ${now ? 'is-now' : ''}`}
            style={e ? { background: entryColor(e, props.auto) } : undefined}
            aria-label={`${DAY_LABEL[d]}요일 ${period}교시${e ? ` ${e.subject}` : ' 비어 있음'}`}
            onClick={() => props.onSelect({ kind: 'cell', day: d, period })}
          >
            {e && (
              <>
                <span className="tt-subject">{e.subject}</span>
                {e.room && <span className="tt-room">{e.room}</span>}
              </>
            )}
          </button>
        )
      })}
    </>
  )
}

function TimeGrid({ auto, settings: s, entries, days, today, minute, sel, onSelect }: GridProps) {
  const perDay = days.map((d) => dayItems(entries, s, d))
  const [from, to] = hourRange(perDay.flat())
  const cols = `56px repeat(${days.length}, minmax(0, 1fr))`

  const addAt = (day: number, e: MouseEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return
    const y = e.clientY - e.currentTarget.getBoundingClientRect().top
    const start = Math.min(
      23 * 60,
      Math.floor((from * 60 + (y / HOUR_PX) * 60) / SNAP_MIN) * SNAP_MIN,
    )
    onSelect({
      kind: 'new',
      slot: {
        kind: 'time',
        day,
        start: fromMin(start),
        end: fromMin(Math.min(start + 60, 23 * 60 + 59)),
      },
    })
  }

  return (
    <div className="tt-time">
      <div className="tt-time-head" style={{ gridTemplateColumns: cols }}>
        <div />
        {days.map((d) => (
          <DayHead key={d} day={d} today={today} />
        ))}
      </div>
      <div className="tt-scroll">
        <div
          className="tt-time-body"
          style={{ gridTemplateColumns: cols, height: (to - from) * HOUR_PX }}
        >
          <div className="tt-hours">
            {Array.from({ length: to - from }, (_, i) => (
              <span key={i} style={{ top: i * HOUR_PX }}>
                {from + i}시
              </span>
            ))}
          </div>
          {days.map((d, di) => (
            <div
              key={d}
              className={`tt-col ${d === today ? 'is-today' : ''}`}
              style={{ backgroundSize: `100% ${HOUR_PX}px` }}
              onDoubleClick={(e) => addAt(d, e)}
              title="두 번 눌러 수업 추가"
            >
              {layoutColumns(perDay[di]!).map(({ item, startMin, endMin, col, cols: n }) => {
                const e = item.entry
                const selected = sel?.kind === 'entry' && sel.id === e.id
                return (
                  <button
                    key={e.id}
                    type="button"
                    className={`tt-block ${selected ? 'is-selected' : ''} ${
                      d === today && isNow(item, minute) ? 'is-now' : ''
                    }`}
                    style={{
                      top: ((startMin - from * 60) / 60) * HOUR_PX,
                      height: Math.max(18, ((endMin - startMin) / 60) * HOUR_PX - 2),
                      left: `calc(${(col / n) * 100}% + 2px)`,
                      width: `calc(${100 / n}% - 4px)`,
                      background: entryColor(e, auto),
                    }}
                    onClick={() => onSelect({ kind: 'entry', id: e.id })}
                  >
                    <span className="tt-subject">{e.subject}</span>
                    <span className="tt-room">
                      {item.start}–{item.end}
                      {e.room && ` · ${e.room}`}
                    </span>
                  </button>
                )
              })}
              {d === today && minute >= from * 60 && minute < to * 60 && (
                <div
                  className="tt-nowline"
                  style={{ top: ((minute - from * 60) / 60) * HOUR_PX }}
                />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/** 오른쪽 편집 패널. 교시 칸은 Enter로 저장하고 다음 요일 칸으로 넘어간다. */
function EntryEditor({
  store,
  auto,
  settings: s,
  sel,
  days,
  onSelect,
}: {
  store: TimetableStore
  auto: ReadonlyMap<string, string>
  settings: TimetableSettings
  sel: Sel
  days: number[]
  onSelect(sel: Sel | null): void
}) {
  const entries = store.data?.entries ?? []
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
  const [color, setColor] = useState<string | null>(entry?.color ?? null)
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
    const content = { subject: subject.trim(), room: room.trim(), color }
    if (!content.subject) {
      if (isPeriod && entry) {
        // 과목을 지우고 저장 = 칸 비우기
        setBusy(true)
        await store.remove(entry.id)
        setBusy(false)
        return onSelect(nextCell())
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
      const created = await store.create(slot, content)
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
        <span>색</span>
        <div className="tt-swatches" role="radiogroup" aria-label="색">
          <button
            type="button"
            role="radio"
            aria-checked={color === null}
            className="tt-swatch is-auto"
            style={{ background: entryColor({ subject, color: null }, auto) }}
            onClick={() => setColor(null)}
          >
            자동
          </button>
          {SUBJECT_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={color === c}
              aria-label={c}
              className="tt-swatch"
              style={{ background: c }}
              onClick={() => setColor(c)}
            />
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

/** 교시 시각 편집. 교시를 줄이면 그 교시 칸들이 지워지므로 한 번 더 눌러 확인한다. */
function PeriodTimes({
  store,
  settings: s,
  entries,
}: {
  store: TimetableStore
  settings: TimetableSettings
  entries: readonly TimetableEntry[]
}) {
  const [draft, setDraft] = useState(s.periods)
  const [confirm, setConfirm] = useState(false)

  const dirty = JSON.stringify(draft) !== JSON.stringify(s.periods)
  const removed = entries.filter(
    (e) => e.slot.kind === 'period' && e.slot.period > draft.length,
  ).length
  const badIndex = draft.findIndex(
    (p, i) => p.start >= p.end || (i > 0 && p.start < draft[i - 1]!.end),
  )
  const next = nextPeriodTime(draft)

  const set = (i: number, key: 'start' | 'end', v: string) => {
    if (!v) return
    setConfirm(false)
    setDraft(draft.map((p, j) => (j === i ? { ...p, [key]: v } : p)))
  }

  return (
    <div className="tt-periods">
      <h2 className="pg-chip">교시 시각</h2>
      <p className="pg-empty">칸을 누르면 과목을 적을 수 있어요.</p>
      <ol className="tt-period-list">
        {draft.map((p, i) => (
          <li key={i} className={i === badIndex ? 'is-bad' : ''}>
            <span className="tt-period-n">{i + 1}교시</span>
            <input
              className="pg-input"
              type="time"
              aria-label={`${i + 1}교시 시작`}
              value={p.start}
              onChange={(e) => set(i, 'start', e.target.value)}
            />
            <span aria-hidden>–</span>
            <input
              className="pg-input"
              type="time"
              aria-label={`${i + 1}교시 끝`}
              value={p.end}
              onChange={(e) => set(i, 'end', e.target.value)}
            />
          </li>
        ))}
      </ol>
      <div className="pg-quick">
        <button
          type="button"
          className="pg-pill"
          disabled={!next || draft.length >= 12}
          onClick={() => next && setDraft([...draft, next])}
        >
          + 교시
        </button>
        <button
          type="button"
          className="pg-pill"
          disabled={draft.length <= 1}
          onClick={() => {
            setConfirm(false)
            setDraft(draft.slice(0, -1))
          }}
        >
          − 마지막 교시
        </button>
      </div>
      {badIndex !== -1 && (
        <p className="tt-error" role="alert">
          {badIndex + 1}교시 시각을 확인해 주세요(끝이 시작보다 뒤, 앞 교시와 겹치지 않게)
        </p>
      )}
      {dirty && (
        <div className="pg-detail-actions">
          <button
            type="button"
            className={`pg-pill ${removed > 0 && confirm ? 'is-danger' : 'is-filled'}`}
            disabled={badIndex !== -1}
            onClick={async () => {
              if (removed > 0 && !confirm) return setConfirm(true)
              setConfirm(false)
              await store.updateSettings({ periods: draft })
            }}
          >
            {removed > 0 && confirm ? `${removed}칸이 지워져요 · 다시 눌러 적용` : '적용'}
          </button>
          <button
            type="button"
            className="pg-pill"
            onClick={() => {
              setConfirm(false)
              setDraft(s.periods)
            }}
          >
            되돌리기
          </button>
        </div>
      )}
    </div>
  )
}
