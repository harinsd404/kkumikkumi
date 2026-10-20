import type { GridBlock, Habit } from '@kkumikkumi/schema'
import { checkKey, habitStreak, isScheduled } from '../../../../shared/habits'
import checkUrl from '../icons/check.svg'
import { useBoard, type HabitData } from '../BoardContext'
import { addDays, localDate, weekOf, parseDate } from '../calendar'
import { paletteVars } from '../style'

type HabitBlockT = Extract<GridBlock, { type: 'habits' }>

/** 미리보기(데이터 없음)용 예시 */
function sample(today: string): HabitData {
  const h = (id: string, name: string, color: string): Habit => ({
    id,
    name,
    color,
    days: 127,
    order: 0,
    createdAt: 0,
    updatedAt: 0,
  })
  const habits = [
    h('a', '물 2L', '#8fb8de'),
    h('b', '영단어 30개', '#93c9a1'),
    h('c', '스트레칭', '#e7c35a'),
  ]
  const checked = new Set<string>()
  for (let i = 1; i <= 6; i++) checked.add(checkKey('a', addDays(today, -i)))
  for (let i = 0; i <= 2; i++) checked.add(checkKey('b', addDays(today, -i)))
  return { habits, checked }
}

const WEEKDAY = '일월화수목금토'

/**
 * 습관: S는 오늘 할 습관 칩(누르면 체크), M은 오늘 목록 + 연속 기록, L은 이번 주 표.
 * 누르면 습관 화면.
 */
export function HabitBlock({ block }: { block: HabitBlockT }) {
  const { theme, data, actions: all, mode, now } = useBoard()
  const actions = mode === 'use' ? all?.habits : undefined
  const p = theme.defaults.palette
  const today = localDate(now.getTime())
  // 예시는 위젯 갤러리(동작 없음)에서만. 실제 보드는 읽기 전이면 비워 둔다
  const d = data.habits ?? (all ? null : sample(today))
  if (!d) return <div className={`khb khb--${block.size}`} style={{ color: p.text }} />
  const has = (id: string, date: string) => d.checked.has(checkKey(id, date))
  const todays = d.habits.filter((h) => isScheduled(h.days, today))
  const toggle = (h: Habit, date: string) => actions?.toggle(h.id, date, !has(h.id, date))
  const vars = { ...paletteVars(p), color: p.text }

  if (d.habits.length === 0)
    return (
      <div className={`khb khb--${block.size}`} style={vars}>
        <p className="kb-empty">습관 화면에서 매일 할 습관을 만들어 보세요</p>
      </div>
    )

  if (block.size === 'S')
    return (
      <div className="khb khb--S" style={vars}>
        <div className="khb-chips">
          {todays.map((h) => (
            <button
              key={h.id}
              type="button"
              className={`khb-chip ${has(h.id, today) ? 'is-done' : ''}`}
              style={has(h.id, today) ? { background: h.color } : { borderColor: h.color }}
              aria-pressed={has(h.id, today)}
              disabled={!actions}
              onClick={() => toggle(h, today)}
            >
              {h.name}
            </button>
          ))}
          {todays.length === 0 && <span className="khb-rest">오늘은 쉬는 날</span>}
        </div>
      </div>
    )

  if (block.size === 'M') {
    const done = todays.filter((h) => has(h.id, today)).length
    return (
      <div className="khb khb--M" style={vars}>
        <p className="khb-head">
          오늘의 습관{' '}
          <span>
            {done}/{todays.length}
          </span>
        </p>
        <ul className="khb-list">
          {todays.map((h) => {
            const on = has(h.id, today)
            const streak = habitStreak(h.days, (x) => has(h.id, x), today)
            return (
              <li key={h.id} data-no-open>
                <button
                  type="button"
                  className={`khb-check ${on ? 'is-done' : ''}`}
                  style={on ? { background: h.color } : { borderColor: h.color }}
                  role="checkbox"
                  aria-checked={on}
                  aria-label={h.name}
                  disabled={!actions}
                  onClick={() => toggle(h, today)}
                >
                  {on && <img src={checkUrl} alt="" draggable={false} />}
                </button>
                <span className="khb-name">{h.name}</span>
                {streak > 0 && <span className="khb-streak">🔥{streak}</span>}
              </li>
            )
          })}
        </ul>
      </div>
    )
  }

  // L: 이번 주 표(월요일 시작)
  const { y, m0, d: day } = parseDate(today)
  const week = weekOf(y, m0, day, 1).map((c) => c.date)
  return (
    <div className="khb khb--L" style={vars}>
      <p className="khb-head">이번 주 습관</p>
      <div
        className="khb-grid"
        style={{ gridTemplateColumns: `minmax(0, 1fr) repeat(7, 44px) 54px` }}
        data-no-open
      >
        <span />
        {week.map((w) => (
          <span key={w} className={`khb-dow ${w === today ? 'is-today' : ''}`}>
            {WEEKDAY[new Date(...ymd(w)).getDay()]}
          </span>
        ))}
        <span />
        {d.habits.map((h) => (
          <HabitRow
            key={h.id}
            h={h}
            week={week}
            today={today}
            has={has}
            onToggle={actions ? toggle : undefined}
          />
        ))}
      </div>
    </div>
  )
}

const ymd = (date: string): [number, number, number] => {
  const { y, m0, d } = parseDate(date)
  return [y, m0, d]
}

function HabitRow({
  h,
  week,
  today,
  has,
  onToggle,
}: {
  h: Habit
  week: string[]
  today: string
  has(id: string, date: string): boolean
  onToggle: ((h: Habit, date: string) => void) | undefined
}) {
  const streak = habitStreak(h.days, (x) => has(h.id, x), today)
  return (
    <>
      <span className="khb-name">
        <span className="khb-dot" style={{ background: h.color }} />
        {h.name}
      </span>
      {week.map((w) => {
        const due = isScheduled(h.days, w)
        const on = has(h.id, w)
        return (
          <button
            key={w}
            type="button"
            className={`khb-cell ${on ? 'is-done' : ''} ${due ? '' : 'is-off'}`}
            style={on ? { background: h.color } : undefined}
            aria-label={`${h.name} ${w}`}
            aria-pressed={on}
            disabled={!onToggle || w > today || !due}
            onClick={() => onToggle?.(h, w)}
          />
        )
      })}
      <span className="khb-streak">{streak > 0 ? `🔥${streak}` : ''}</span>
    </>
  )
}
