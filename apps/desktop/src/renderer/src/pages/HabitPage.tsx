import type { Habit } from '@kkumikkumi/schema'
import { useState } from 'react'
import './pages.css'
import {
  checkKey,
  dayProgress,
  daysLabel,
  EVERY_DAY,
  habitStreak,
  hasDay,
  isScheduled,
  toggleDay,
} from '../../../shared/habits'
import type { HabitStore } from '../app/useHabits'
import { addDays, localDate, parseDate, weekOf } from '../board/calendar'
import { SPRINT_COLORS } from '../board/sprint'
import checkUrl from '../board/icons/check.svg'
import { ConfirmButton } from '../ui/ConfirmButton'
import { monthDay } from './dateText'

const WEEKDAY = '일월화수목금토'
/** 요일 고르기 순서(월요일부터) */
const PICK_ORDER = [1, 2, 3, 4, 5, 6, 0]
/** 지난 주는 1년까지 본다(main에서 그만큼 읽는다) */
const MAX_WEEKS_BACK = 52

/** 습관 화면(2026-10-21): 이번 주 표(체크), 연속 기록, 이름·색·요일 고치기, 오른쪽에 오늘·이번 주 요약 */
export function HabitPage({ store, now }: { store: HabitStore; now: Date }) {
  const today = localDate(now.getTime())
  const [back, setBack] = useState(0)
  const [openId, setOpenId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const data = store.data
  const { y, m0, d } = parseDate(addDays(today, -7 * back))
  const week = weekOf(y, m0, d, 1).map((c) => c.date)
  const habits = data?.habits ?? []
  const has = (id: string, date: string) => !!data?.checked.has(checkKey(id, date))

  return (
    <div className="pg hbp">
      <section className="pg-card hbp-main" aria-label="습관">
        <header className="pg-head">
          <h1 className="pg-title">습관</h1>
          <div className="pg-tabs">
            <button
              type="button"
              className="pg-pill pg-round"
              aria-label="지난주"
              disabled={back >= MAX_WEEKS_BACK}
              onClick={() => setBack(back + 1)}
            >
              ‹
            </button>
            <button
              type="button"
              className="pg-pill"
              disabled={back === 0}
              onClick={() => setBack(0)}
            >
              이번 주
            </button>
            <button
              type="button"
              className="pg-pill pg-round"
              aria-label="다음 주"
              disabled={back === 0}
              onClick={() => setBack(back - 1)}
            >
              ›
            </button>
          </div>
        </header>
        <p className="hbp-range">
          {monthDay(week[0]!)} ~ {monthDay(week[6]!)}
        </p>

        <div className="hbp-table" role="grid" aria-label="이번 주 습관">
          <div className="hbp-row hbp-row--head" role="row">
            <span />
            {week.map((w) => (
              <span
                key={w}
                role="columnheader"
                className={`hbp-dow ${w === today ? 'is-today' : ''}`}
              >
                {WEEKDAY[new Date(...ymd(w)).getDay()]}
                <small>{parseDate(w).d}</small>
              </span>
            ))}
            <span className="hbp-streak-head">연속</span>
          </div>
          {habits.map((h) => (
            <div key={h.id} className="hbp-item">
              <div className="hbp-row" role="row">
                <button
                  type="button"
                  className="hbp-name"
                  aria-expanded={openId === h.id}
                  onClick={() => setOpenId(openId === h.id ? null : h.id)}
                >
                  <span className="hbp-dot" style={{ background: h.color }} />
                  <span className="hbp-name-text">{h.name}</span>
                  <small>{daysLabel(h.days)}</small>
                </button>
                {week.map((w) => {
                  const due = isScheduled(h.days, w)
                  const on = has(h.id, w)
                  return (
                    <button
                      key={w}
                      type="button"
                      role="gridcell"
                      className={`hbp-cell ${on ? 'is-done' : ''} ${due ? '' : 'is-off'}`}
                      style={on ? { background: h.color } : { borderColor: h.color }}
                      aria-pressed={on}
                      aria-label={`${h.name} ${monthDay(w)}${due ? '' : ' (쉬는 날)'}`}
                      disabled={w > today}
                      onClick={() => store.toggle(h.id, w, !on)}
                    >
                      {on && <img src={checkUrl} alt="" draggable={false} />}
                    </button>
                  )
                })}
                <span className="hbp-streak">
                  {(() => {
                    const n = habitStreak(h.days, (x) => has(h.id, x), today)
                    return n > 0 ? `🔥 ${n}` : '–'
                  })()}
                </span>
              </div>
              {openId === h.id && (
                <HabitEdit key={h.id} habit={h} store={store} onClose={() => setOpenId(null)} />
              )}
            </div>
          ))}
        </div>

        {adding ? (
          <NewHabit
            onCreate={async (name) => {
              if (
                await store.create({
                  name,
                  color: SPRINT_COLORS[habits.length % SPRINT_COLORS.length]!,
                })
              )
                setAdding(false)
            }}
            onCancel={() => setAdding(false)}
          />
        ) : (
          <button
            type="button"
            className="tdo-cat-chip tdo-new-cat"
            onClick={() => setAdding(true)}
          >
            + 습관 추가
          </button>
        )}
        {data && habits.length === 0 && !adding && (
          <p className="pg-empty">
            "물 2L 마시기", "영단어 30개"처럼 매일 할 일을 습관으로 만들어 보세요.
          </p>
        )}
      </section>

      <Summary habits={habits} has={has} today={today} />
    </div>
  )
}

const ymd = (date: string): [number, number, number] => {
  const { y, m0, d } = parseDate(date)
  return [y, m0, d]
}

/** 오른쪽: 오늘 한 것, 이번 주 달성률, 가장 긴 연속, 오늘 남은 습관 */
function Summary({
  habits,
  has,
  today,
}: {
  habits: readonly Habit[]
  has(id: string, date: string): boolean
  today: string
}) {
  const td = dayProgress(habits, has, today)
  const { y, m0, d } = parseDate(today)
  const week = weekOf(y, m0, d, 1)
    .map((c) => c.date)
    .filter((w) => w <= today)
  const wk = week.reduce(
    (a, w) => {
      const p = dayProgress(habits, has, w)
      return { done: a.done + p.done, total: a.total + p.total }
    },
    { done: 0, total: 0 },
  )
  const best = habits
    .map((h) => ({ h, n: habitStreak(h.days, (x) => has(h.id, x), today) }))
    .sort((a, b) => b.n - a.n)[0]
  const left = habits.filter((h) => isScheduled(h.days, today) && !has(h.id, today))
  return (
    <aside className="pg-card hbp-side" aria-label="요약">
      <div className="hbp-stat">
        <span>오늘</span>
        <strong>
          {td.done}/{td.total}
        </strong>
      </div>
      <div className="hbp-stat">
        <span>이번 주 달성률</span>
        <strong>{wk.total ? Math.round((wk.done / wk.total) * 100) : 0}%</strong>
      </div>
      {best && best.n > 0 && (
        <div className="hbp-stat">
          <span>가장 긴 연속</span>
          <strong>
            🔥 {best.n}일 <small>{best.h.name}</small>
          </strong>
        </div>
      )}
      <h2 className="pg-chip">오늘 남은 습관</h2>
      {left.length === 0 ? (
        <p className="pg-empty">{td.total ? '오늘 습관을 다 했어요!' : '오늘은 쉬는 날이에요'}</p>
      ) : (
        <ul className="hbp-left">
          {left.map((h) => (
            <li key={h.id}>
              <span className="hbp-dot" style={{ background: h.color }} />
              {h.name}
            </li>
          ))}
        </ul>
      )}
    </aside>
  )
}

function NewHabit({
  onCreate,
  onCancel,
}: {
  onCreate(name: string): void | Promise<unknown>
  onCancel(): void
}) {
  const [name, setName] = useState('')
  // 저장 중에는 다시 보내지 않는다(Enter 두 번에 둘 생기지 않도록)
  const [saving, setSaving] = useState(false)
  return (
    <form
      className="hbp-new"
      onSubmit={(e) => {
        e.preventDefault()
        if (!name.trim() || saving) return
        setSaving(true)
        void Promise.resolve(onCreate(name.trim())).finally(() => setSaving(false))
      }}
    >
      <input
        className="pg-input"
        autoFocus
        placeholder="습관 이름 (예: 물 2L 마시기)"
        aria-label="새 습관 이름"
        maxLength={30}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation()
            onCancel()
          }
        }}
      />
      <button type="submit" className="pg-pill" disabled={!name.trim() || saving}>
        만들기
      </button>
      <button type="button" className="pg-pill" onClick={onCancel}>
        취소
      </button>
    </form>
  )
}

/** 펼친 습관: 이름, 색, 하는 요일, 지우기 */
function HabitEdit({
  habit: h,
  store,
  onClose,
}: {
  habit: Habit
  store: HabitStore
  onClose(): void
}) {
  return (
    <div className="tdo-detail hbp-edit">
      <div className="tdo-detail-row">
        <label className="pg-field">
          <span>이름</span>
          <input
            className="pg-input"
            defaultValue={h.name}
            maxLength={30}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) e.currentTarget.blur()
            }}
            onBlur={(e) => {
              const v = e.currentTarget.value.trim()
              if (v && v !== h.name) void store.update(h.id, { name: v })
              else e.currentTarget.value = h.name
            }}
          />
        </label>
        <div className="pg-field">
          <span>색</span>
          <div className="tdo-sprint-colors" role="radiogroup" aria-label="습관 색">
            {SPRINT_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={h.color === c}
                aria-label={c}
                style={{ background: c }}
                onClick={() => void store.update(h.id, { color: c })}
              />
            ))}
          </div>
        </div>
      </div>
      <div className="pg-field">
        <span>하는 요일 · {daysLabel(h.days)}</span>
        <div className="hbp-days">
          {PICK_ORDER.map((w) => (
            <button
              key={w}
              type="button"
              aria-pressed={hasDay(h.days, w)}
              // 마지막 하나는 끌 수 없다(요일이 하나도 없으면 안 됨)
              disabled={hasDay(h.days, w) && (h.days & (h.days - 1)) === 0}
              onClick={() => void store.update(h.id, { days: toggleDay(h.days, w) })}
            >
              {WEEKDAY[w]}
            </button>
          ))}
          <button
            type="button"
            className="hbp-every"
            disabled={h.days === EVERY_DAY}
            onClick={() => void store.update(h.id, { days: EVERY_DAY })}
          >
            매일
          </button>
        </div>
      </div>
      <div className="pg-detail-actions">
        <ConfirmButton
          key={h.id}
          label="삭제"
          confirmLabel="기록까지 지울까요?"
          onConfirm={() => store.remove(h.id)}
        />
        <span className="pg-spacer" />
        <button type="button" className="pg-pill" onClick={onClose}>
          닫기
        </button>
      </div>
    </div>
  )
}
