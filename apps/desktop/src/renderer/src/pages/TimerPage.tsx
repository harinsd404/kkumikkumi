import {
  DEFAULT_POMODORO,
  type PomodoroSettings,
  type TimerSession,
  type TimerState,
} from '@kkumikkumi/schema'
import { useEffect, useState, type ReactNode } from 'react'
import { phaseText } from '../../../shared/pomodoro'
import {
  DEFAULT_TIMER,
  formatClock,
  remainingMs,
  type TimerCommand,
  type TimerMode,
} from '../../../shared/timer'
import { localDate, localDayStart, timeLabel, addDays, weekOf } from '../board/calendar'
import { useSecondClock } from '../board/useSecondClock'
import { dateParts, monthDay, weekdayLabel } from './dateText'
import { focusByDay, formatDuration, lastDays, summarize } from '../board/timerStats'
import './pages.css'

interface Props {
  timer: TimerState | undefined
  pomodoro: PomodoroSettings | undefined
  command(c: TimerCommand): void
  sessions(fromMs: number, toMs: number): Promise<TimerSession[]>
  updatePomodoro(patch: Partial<PomodoroSettings>): Promise<boolean>
  /** 날짜 계산용(분 단위 시계) */
  now: Date
  weekStartsOn: 0 | 1
  /** 미니 타이머 창 열기 */
  openMini(): void
}

type Tab = 'timer' | 'pomodoro'
const MIN = 60_000
const PRESETS = [5, 10, 15, 25, 45, 60]
const RING_R = 120
const RING_C = 2 * Math.PI * RING_R

/** 타이머 세부 페이지: 큰 타이머(일반/뽀모도로) + 기록과 통계 */
export function TimerPage(p: Props) {
  const t = p.timer ?? { ...DEFAULT_TIMER, updatedAt: 0 }
  const set = p.pomodoro ?? DEFAULT_POMODORO
  const idle = t.status === 'idle'
  // 돌고 있으면 그 종류의 탭을 보여 주고 바꿀 수 없다. 대기 중이면 사이클이 있을 때 뽀모도로부터.
  const [pickTab, setPickTab] = useState<Tab | null>(null)
  const active: Tab = t.pomodoro ? 'pomodoro' : 'timer'
  const tab = idle ? (pickTab ?? active) : active

  return (
    <div className="pg pg-timer">
      <section className="pg-card tp-main" aria-label="타이머">
        <div className="pg-head tp-head">
          <div className="pg-tabs" role="tablist" aria-label="종류">
            {(['timer', 'pomodoro'] as const).map((k) => (
              <button
                key={k}
                type="button"
                role="tab"
                className="pg-pill"
                aria-selected={tab === k}
                disabled={!idle && tab !== k}
                onClick={() => setPickTab(k)}
              >
                {k === 'timer' ? '타이머' : '뽀모도로'}
              </button>
            ))}
          </div>
          <span className="pg-spacer" />
          <button type="button" className="pg-pill is-filled" onClick={p.openMini}>
            미니 창으로 띄우기
          </button>
        </div>
        {tab === 'timer' ? (
          <PlainTimer t={t} command={p.command} />
        ) : (
          <Pomodoro t={t} set={set} command={p.command} update={p.updatePomodoro} />
        )}
      </section>
      <Stats
        sessions={p.sessions}
        version={t.updatedAt}
        now={p.now}
        weekStartsOn={p.weekStartsOn}
      />
    </div>
  )
}

/** 큰 링과 남은 시간 */
function Face({ t, total, label }: { t: TimerState; total: number; label: string }) {
  const now = useSecondClock(t.status === 'running')
  const left = t.status === 'idle' ? total : remainingMs(t, now)
  const progress = total > 0 ? left / total : 0
  return (
    <div className="tp-face">
      <svg className="tp-ring" viewBox="0 0 280 280" aria-hidden>
        <circle cx={140} cy={140} r={RING_R} className="tp-ring-bg" />
        <circle
          cx={140}
          cy={140}
          r={RING_R}
          className="tp-ring-fg"
          strokeDasharray={RING_C}
          strokeDashoffset={RING_C * (1 - progress)}
          transform="rotate(-90 140 140)"
        />
      </svg>
      <div className="tp-face-text">
        <span className="tp-label">{label}</span>
        <span className="tp-time" role="timer" aria-label={`남은 시간 ${formatClock(left)}`}>
          {formatClock(left)}
        </span>
        {t.status === 'paused' && <span className="tp-label">일시정지</span>}
      </div>
    </div>
  )
}

function Controls({
  t,
  command,
  onStart,
  extra,
}: {
  t: TimerState
  command(c: TimerCommand): void
  onStart(): void
  extra?: ReactNode
}) {
  return (
    <div className="tp-buttons">
      {t.status === 'idle' ? (
        <button type="button" className="pg-pill tp-primary" onClick={onStart}>
          시작
        </button>
      ) : t.status === 'running' ? (
        <button
          type="button"
          className="pg-pill tp-primary"
          onClick={() => command({ cmd: 'pause' })}
        >
          일시정지
        </button>
      ) : (
        <button
          type="button"
          className="pg-pill tp-primary"
          onClick={() => command({ cmd: 'resume' })}
        >
          계속
        </button>
      )}
      {t.status !== 'idle' && (
        <button
          type="button"
          className="pg-pill is-filled"
          onClick={() => command({ cmd: 'reset' })}
        >
          초기화
        </button>
      )}
      {extra}
    </div>
  )
}

function PlainTimer({ t, command }: { t: TimerState; command(c: TimerCommand): void }) {
  const idle = t.status === 'idle'
  const lastMin = Math.round(t.durationMs / MIN)
  const [min, setMin] = useState<number>(t.pomodoro ? 25 : lastMin)
  const [mode, setMode] = useState<TimerMode>(t.pomodoro ? 'focus' : t.mode)
  const total = idle ? min * MIN : t.durationMs
  const shownMode = idle ? mode : t.mode

  return (
    <>
      <Face t={t} total={total} label={shownMode === 'focus' ? '집중' : '휴식'} />
      {idle && (
        <div className="tp-options">
          <div className="pg-tabs" role="radiogroup" aria-label="모드">
            {(['focus', 'break'] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={mode === m}
                className="pg-pill"
                onClick={() => setMode(m)}
              >
                {m === 'focus' ? '집중' : '휴식'}
              </button>
            ))}
          </div>
          <div className="pg-tabs" role="radiogroup" aria-label="시간">
            {PRESETS.map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={min === m}
                className="pg-pill"
                onClick={() => setMin(m)}
              >
                {m}분
              </button>
            ))}
            <label className="tp-custom">
              <input
                className="pg-input"
                type="number"
                min={1}
                max={180}
                value={min}
                aria-label="직접 입력(분)"
                onChange={(e) => {
                  const v = Math.round(Number(e.target.value))
                  if (v >= 1 && v <= 180) setMin(v)
                }}
              />
              <span>분</span>
            </label>
          </div>
        </div>
      )}
      <Controls
        t={t}
        command={command}
        onStart={() => command({ cmd: 'start', durationMs: min * MIN, mode })}
      />
    </>
  )
}

function Pomodoro({
  t,
  set,
  command,
  update,
}: {
  t: TimerState
  set: PomodoroSettings
  command(c: TimerCommand): void
  update(patch: Partial<PomodoroSettings>): Promise<boolean>
}) {
  const pos = t.pomodoro ?? { phase: 'focus' as const, round: 1 }
  const total = t.pomodoro ? t.durationMs : set.focusMin * MIN
  return (
    <>
      <Face t={t} total={total} label={phaseText(pos, set)} />
      <Controls
        t={t}
        command={command}
        onStart={() => command({ cmd: 'pomodoro.start' })}
        extra={
          t.pomodoro && (
            <>
              <button
                type="button"
                className="pg-pill is-filled"
                onClick={() => command({ cmd: 'pomodoro.skip' })}
              >
                건너뛰기
              </button>
              <button
                type="button"
                className="pg-pill"
                onClick={() => command({ cmd: 'pomodoro.stop' })}
              >
                사이클 끝내기
              </button>
            </>
          )
        }
      />
      <PomodoroSettingsForm set={set} update={update} />
    </>
  )
}

const FIELDS: {
  key: Exclude<keyof PomodoroSettings, 'autoStart'>
  label: string
  min: number
  max: number
  unit: string
}[] = [
  { key: 'focusMin', label: '집중', min: 1, max: 180, unit: '분' },
  { key: 'shortBreakMin', label: '짧은 휴식', min: 1, max: 60, unit: '분' },
  { key: 'longBreakMin', label: '긴 휴식', min: 1, max: 120, unit: '분' },
  { key: 'longEvery', label: '긴 휴식 전 집중', min: 2, max: 12, unit: '회' },
]

export function PomodoroSettingsForm({
  set,
  update,
}: {
  set: PomodoroSettings
  update(patch: Partial<PomodoroSettings>): Promise<boolean>
}) {
  return (
    <div className="tp-settings" aria-label="뽀모도로 설정">
      {FIELDS.map((f) => (
        <label key={f.key} className="pg-field tp-field">
          <span>{f.label}</span>
          <span className="tp-field-row">
            <input
              key={set[f.key]} // 저장된 값이 바뀌면(거부 포함) 입력칸을 다시 맞춘다
              className="pg-input"
              type="number"
              min={f.min}
              max={f.max}
              defaultValue={set[f.key]}
              onBlur={(e) => {
                const v = Math.round(Number(e.currentTarget.value))
                if (v >= f.min && v <= f.max && v !== set[f.key]) void update({ [f.key]: v })
                else e.currentTarget.value = String(set[f.key])
              }}
              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            />
            <span>{f.unit}</span>
          </span>
        </label>
      ))}
      <label className="tp-toggle">
        <input
          type="checkbox"
          checked={set.autoStart}
          onChange={(e) => void update({ autoStart: e.target.checked })}
        />
        <span>다음 단계 자동 시작</span>
      </label>
    </div>
  )
}

function Stats({
  sessions,
  version,
  now,
  weekStartsOn,
}: {
  sessions: Props['sessions']
  version: number
  now: Date
  weekStartsOn: 0 | 1
}) {
  const today = localDate(now.getTime())
  const days = lastDays(today, 7)
  const [y, m, d] = dateParts(today)
  const weekDays = weekOf(y, m - 1, d, weekStartsOn).map((c) => c.date)
  const from = localDayStart(weekDays[0]! < days[0]! ? weekDays[0]! : days[0]!)
  const to = localDayStart(addDays(today, 1))
  const [list, setList] = useState<TimerSession[]>([])

  // 타이머 상태가 바뀔 때(완료/중단 기록이 생길 수 있음)와 날짜가 바뀔 때 다시 읽는다
  useEffect(() => {
    let alive = true
    void sessions(from, to).then((r) => alive && setList(r))
    return () => {
      alive = false
    }
  }, [sessions, from, to, version])

  const sum = summarize(list, today, weekDays)
  const byDay = focusByDay(list, days)
  const max = Math.max(...byDay.values(), 25 * MIN)

  return (
    <aside className="pg-card tp-stats" aria-label="기록">
      <h2 className="pg-chip">기록</h2>
      <dl className="tp-sum">
        <div>
          <dt>오늘 집중</dt>
          <dd>{formatDuration(sum.todayMs)}</dd>
        </div>
        <div>
          <dt>이번 주</dt>
          <dd>{formatDuration(sum.weekMs)}</dd>
        </div>
        <div>
          <dt>오늘 완료</dt>
          <dd>{sum.todayDone}회</dd>
        </div>
      </dl>
      <div className="tp-bars" role="img" aria-label="최근 7일 집중 시간">
        {days.map((day) => {
          const ms = byDay.get(day) ?? 0
          return (
            <div key={day} className="tp-bar" title={`${monthDay(day)} ${formatDuration(ms)}`}>
              <span className="tp-bar-fill" style={{ height: `${(ms / max) * 100}%` }} />
              <span className={`tp-bar-label ${day === today ? 'is-today' : ''}`}>
                {weekdayLabel(day)}
              </span>
            </div>
          )
        })}
      </div>
      <h3 className="pg-field-label">최근 기록</h3>
      {list.length === 0 ? (
        <p className="pg-empty">아직 기록이 없어요</p>
      ) : (
        <ul className="tp-log">
          {list.slice(0, 20).map((s) => (
            <li key={s.id}>
              <span className="tp-log-time">
                {localDate(s.endedAt) === today ? '' : `${monthDay(localDate(s.endedAt))} `}
                {timeLabel(s.startedAt)}–{timeLabel(s.endedAt)}
              </span>
              <span className="tp-log-kind">{s.kind === 'focus' ? '집중' : '휴식'}</span>
              <span>{formatDuration(s.actualMs)}</span>
              <span className={`tp-log-state ${s.completed ? '' : 'is-stopped'}`}>
                {s.completed ? '완료' : '중단'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </aside>
  )
}
