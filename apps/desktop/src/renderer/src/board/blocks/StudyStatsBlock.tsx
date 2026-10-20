import type { GridBlock, TimerSession } from '@kkumikkumi/schema'
import { useBoard } from '../BoardContext'
import { addDays, localDate, localDateTime, localDayStart, parseDate } from '../calendar'
import { blockPalette, paletteVars } from '../style'
import {
  focusByDay,
  formatDuration,
  lastDays,
  streakMayBeLonger,
  studyStreak,
  summarize,
} from '../timerStats'
import { useKeyedAsync } from '../useKeyedAsync'

type StudyStatsBlockT = Extract<GridBlock, { type: 'studyStats' }>

/** 연속 기록을 셀 때 거슬러 보는 날 수 */
const HISTORY_DAYS = 366
/** main timer.sessions가 한 번에 주는 최대 기록 수(main/db/repos/timerSessions.ts endedBetween) */
const SESSION_LIMIT = 1000
const WEEKDAY = '일월화수목금토'

/** 미리보기(데이터 통로 없음)용 예시 기록: 최근 며칠 집중 */
function sampleSessions(today: string): TimerSession[] {
  const mins = [50, 0, 75, 40, 90, 60, 85]
  return mins.flatMap((m, i) =>
    m === 0
      ? []
      : [
          {
            id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
            kind: 'focus' as const,
            pomodoro: false,
            startedAt: 0,
            endedAt: localDateTime(addDays(today, i - 6), '20:00'),
            plannedMs: m * 60_000,
            actualMs: m * 60_000,
            completed: true,
          },
        ],
  )
}

/**
 * 공부 통계: 타이머 기록으로 오늘 집중 시간, 이번 주(최근 7일), 연속 공부한 날. M은 7일 막대도.
 * 타이머가 바뀌거나(기록이 생김) 날짜가 바뀌면 다시 읽는다. 누르면 타이머 화면.
 */
export function StudyStatsBlock({ block }: { block: StudyStatsBlockT }) {
  const { theme, data, actions, now } = useBoard()
  const p = blockPalette(theme, block)
  const today = localDate(now.getTime())
  const week = lastDays(today, 7)
  const load = actions?.timer.sessions
  const loaded = useKeyedAsync(
    `${today}|${data.timer?.updatedAt ?? 0}|${data.version ?? 0}`,
    load
      ? () => load(localDayStart(addDays(today, -HISTORY_DAYS)), localDayStart(addDays(today, 1)))
      : null,
    true,
  )
  const sessions = load ? loaded : sampleSessions(today)
  const sum = sessions ? summarize(sessions, today, week) : null
  const byDay = sessions ? focusByDay(sessions, week) : null
  const streak = sessions ? studyStreak(sessions, today) : 0
  // 읽어 온 범위 끝까지 이어지면 더 길 수 있으니 "N일+"로
  const more =
    !!load &&
    !!sessions &&
    streakMayBeLonger(sessions, today, streak, addDays(today, -HISTORY_DAYS), SESSION_LIMIT)
  const max = byDay ? Math.max(1, ...byDay.values()) : 1

  return (
    <div className={`kst kst--${block.size}`} style={{ ...paletteVars(p), color: p.text }}>
      {block.size === 'M' && <p className="kst-head">공부 통계</p>}
      <div className="kst-main">
        <span className="kst-label">오늘 집중</span>
        <strong className="kst-today">{sum ? formatDuration(sum.todayMs) : '…'}</strong>
      </div>
      {sum && (
        <p className="kst-sub">
          {block.size === 'M' && <>이번 주 {formatDuration(sum.weekMs)} · </>}
          {sum.todayDone}회 · 연속 {streak}일{more ? '+' : ''}
        </p>
      )}
      {block.size === 'M' && byDay && (
        <div className="kst-bars" role="img" aria-label="최근 7일 집중 시간">
          {week.map((d) => {
            const v = byDay.get(d) ?? 0
            const { y, m0, d: day } = parseDate(d)
            return (
              <div key={d} className={`kst-bar ${d === today ? 'is-today' : ''}`}>
                <span className="kst-bar-track">
                  <span className="kst-bar-fill" style={{ height: `${(v / max) * 100}%` }} />
                </span>
                <span className="kst-bar-day">{WEEKDAY[new Date(y, m0, day).getDay()]}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
