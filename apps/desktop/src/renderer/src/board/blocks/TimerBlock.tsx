import { DEFAULT_POMODORO, type GridBlock, type TimerState } from '@kkumikkumi/schema'
import { useState } from 'react'
import { phaseText } from '../../../../shared/pomodoro'
import { DEFAULT_TIMER, formatClock, remainingMs, type TimerMode } from '../../../../shared/timer'
import { useBoard } from '../BoardContext'
import { useSecondClock } from '../useSecondClock'
import { blockPalette } from '../style'

type TimerBlockT = Extract<GridBlock, { type: 'timer' }>

const MIN = 60_000
const RING_C = 2 * Math.PI * 44

/**
 * 타이머 블록. 상태는 main이 가진 하나의 타이머(여러 블록이 같은 타이머를 보여 준다).
 * S(2x1): 시간 + 시작/일시정지 + 초기화. M(2x2): 시간(숫자/링) + 집중/휴식 + 프리셋 + 버튼.
 */
export function TimerBlock({ block }: { block: TimerBlockT }) {
  const { theme, data, actions: all, mode: boardMode } = useBoard()
  const actions = boardMode === 'use' ? all : undefined
  const p = blockPalette(theme, block)
  const presets = block.props.presetsMin
  const t: TimerState = data.timer ?? { ...DEFAULT_TIMER, updatedAt: 0 }
  const running = t.status === 'running'
  const now = useSecondClock(running)

  // 대기 중일 때 고른 프리셋/모드(블록마다 따로). 기본: 지난번 길이가 프리셋에 있으면 그것, 아니면 첫 프리셋.
  const [pick, setPick] = useState<number | null>(null)
  const [pickMode, setPickMode] = useState<TimerMode | null>(null)
  const lastMin = Math.round(t.durationMs / MIN)
  // 고른 프리셋이 인스펙터에서 지워졌으면 고르지 않은 것으로 본다
  const picked = pick !== null && presets.includes(pick) ? pick : null
  const selMin = picked ?? (presets.includes(lastMin) ? lastMin : (presets[0] ?? 25))
  const selMode = pickMode ?? t.mode

  const idle = t.status === 'idle'
  // 뽀모도로 사이클 중이면 준비된 단계 길이를 쓰고, 시작은 사이클을 이어 간다
  const pomo = t.pomodoro
  const total = idle && !pomo ? selMin * MIN : t.durationMs
  const left = idle ? total : remainingMs(t, now)
  const progress = total > 0 ? left / total : 0
  const big = block.size !== 'S'
  const ring = big && block.props.display === 'ring'
  const cmd = actions?.timer.command

  const primary = idle
    ? pomo
      ? { label: '시작', run: () => cmd?.({ cmd: 'pomodoro.start' }) }
      : {
          label: '시작',
          run: () => cmd?.({ cmd: 'start', durationMs: selMin * MIN, mode: selMode }),
        }
    : running
      ? { label: '일시정지', run: () => cmd?.({ cmd: 'pause' }) }
      : { label: '계속', run: () => cmd?.({ cmd: 'resume' }) }

  const btnStyle = { background: p.control, color: p.text }

  return (
    <div className={`ktm ktm--${block.size} ${ring ? 'ktm--ring' : ''}`}>
      {big && pomo && (
        <div className="ktm-modes">
          <span className="ktm-phase" style={btnStyle}>
            {phaseText(pomo, data.pomodoro ?? DEFAULT_POMODORO)}
          </span>
        </div>
      )}
      {big && !pomo && (
        <div className="ktm-modes" role="radiogroup" aria-label="모드">
          {(['focus', 'break'] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={(idle ? selMode : t.mode) === m}
              disabled={!actions || !idle}
              className={(idle ? selMode : t.mode) === m ? 'is-on' : ''}
              style={(idle ? selMode : t.mode) === m ? btnStyle : { color: p.subText }}
              onClick={() => setPickMode(m)}
            >
              {m === 'focus' ? '집중' : '휴식'}
            </button>
          ))}
        </div>
      )}
      <div className="ktm-face">
        {ring && (
          <svg className="ktm-ring" viewBox="0 0 100 100" aria-hidden>
            <circle cx={50} cy={50} r={44} fill="none" stroke={p.surface} strokeWidth={5} />
            <circle
              cx={50}
              cy={50}
              r={44}
              fill="none"
              stroke={p.accent}
              strokeWidth={5}
              strokeLinecap="round"
              strokeDasharray={RING_C}
              strokeDashoffset={RING_C * (1 - progress)}
              transform="rotate(-90 50 50)"
            />
          </svg>
        )}
        <span
          className="ktm-time"
          role="timer"
          aria-label={`남은 시간 ${formatClock(left)}`}
          style={{ color: p.text, fontSize: block.size === 'S' ? 56 : ring ? 44 : 64 }}
        >
          {formatClock(left)}
        </span>
      </div>
      {big && idle && !pomo && presets.length > 1 && (
        <div className="ktm-presets" role="radiogroup" aria-label="시간">
          {presets.map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={m === selMin}
              disabled={!actions}
              style={m === selMin ? btnStyle : { color: p.subText }}
              onClick={() => setPick(m)}
            >
              {m}분
            </button>
          ))}
        </div>
      )}
      {actions && (
        <div className="ktm-buttons">
          <button type="button" className="ktm-primary" style={btnStyle} onClick={primary.run}>
            {primary.label}
          </button>
          {!idle && (
            <button
              type="button"
              style={{ color: p.subText }}
              onClick={() => cmd?.({ cmd: 'reset' })}
            >
              초기화
            </button>
          )}
        </div>
      )}
    </div>
  )
}
