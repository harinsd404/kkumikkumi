import {
  DEFAULT_MINI_TIMER,
  DEFAULT_POMODORO,
  type MiniTimerPrefs,
  type PomodoroSettings,
  type Theme,
  type TimerState,
} from '@kkumikkumi/schema'
import { useEffect, useState } from 'react'
import { phaseText } from '../../../shared/pomodoro'
import { DEFAULT_TIMER, formatClock, remainingMs, type TimerCommand } from '../../../shared/timer'
import { useSecondClock } from '../board/useSecondClock'
import { themeVars } from './themeVars'
import './mini.css'

/**
 * 미니 타이머 창(#mini). 보드 창과 같은 main 타이머를 보여 주고 조작한다.
 * 창 전체를 끌어서 옮기고, 버튼만 누를 수 있다.
 */
export function MiniTimerApp() {
  const [theme, setTheme] = useState<Theme | null>(null)
  const [t, setT] = useState<TimerState>({ ...DEFAULT_TIMER, updatedAt: 0 })
  const [pomo, setPomo] = useState<PomodoroSettings>(DEFAULT_POMODORO)
  const [prefs, setPrefs] = useState<MiniTimerPrefs>(DEFAULT_MINI_TIMER)

  useEffect(() => {
    void (async () => {
      const k = window.kkumi
      const s = await k.invoke('settings.get')
      if (s.ok) {
        const th = await k.invoke('themes.get', { id: s.value.activeThemeId })
        if (th.ok) setTheme(th.value)
      }
      const [timer, p, mp] = await Promise.all([
        k.invoke('timer.get'),
        k.invoke('timer.pomodoro.get'),
        k.invoke('miniTimer.prefs'),
      ])
      if (timer.ok) setT(timer.value)
      if (p.ok) setPomo(p.value)
      if (mp.ok) setPrefs(mp.value)
    })()
    window.kkumi.onTimerChanged(setT)
    // 뽀모도로 설정과 항상 위는 보드 창(타이머·설정 페이지)에서 바뀔 수 있어 창이 다시 보일 때 맞춘다
    const onFocus = async () => {
      const [p, mp] = await Promise.all([
        window.kkumi.invoke('timer.pomodoro.get'),
        window.kkumi.invoke('miniTimer.prefs'),
      ])
      if (p.ok) setPomo(p.value)
      if (mp.ok) setPrefs(mp.value)
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [])

  const now = useSecondClock(t.status === 'running')
  const idle = t.status === 'idle'
  const left = idle ? t.durationMs : remainingMs(t, now)
  const label = t.pomodoro ? phaseText(t.pomodoro, pomo) : t.mode === 'focus' ? '집중' : '휴식'
  const send = async (c: TimerCommand) => {
    const r = await window.kkumi.invoke('timer.command', c)
    if (r.ok) setT(r.value)
  }
  const start = () =>
    send(
      t.pomodoro
        ? { cmd: 'pomodoro.start' }
        : { cmd: 'start', durationMs: t.durationMs, mode: t.mode },
    )
  const togglePin = async () => {
    const r = await window.kkumi.invoke('miniTimer.update', {
      patch: { alwaysOnTop: !prefs.alwaysOnTop },
    })
    if (r.ok) setPrefs(r.value)
  }

  return (
    <div className="mini" style={theme ? themeVars(theme) : undefined}>
      <div className="mini-top">
        <span className="mini-label">
          {label}
          {t.status === 'paused' && ' · 일시정지'}
        </span>
        <button
          type="button"
          className={`mini-icon ${prefs.alwaysOnTop ? 'is-on' : ''}`}
          aria-pressed={prefs.alwaysOnTop}
          aria-label="항상 위에 두기"
          title={prefs.alwaysOnTop ? '항상 위: 켜짐' : '항상 위: 꺼짐'}
          onClick={() => void togglePin()}
        >
          📌
        </button>
        <button
          type="button"
          className="mini-icon"
          aria-label="미니 타이머 닫기"
          title="닫기 (타이머는 계속 돌아요)"
          onClick={() => void window.kkumi.invoke('miniTimer.close')}
        >
          ×
        </button>
      </div>
      <span className="mini-time" role="timer" aria-label={`남은 시간 ${formatClock(left)}`}>
        {formatClock(left)}
      </span>
      <div className="mini-buttons">
        {idle ? (
          <button type="button" className="mini-btn is-primary" onClick={() => void start()}>
            시작
          </button>
        ) : t.status === 'running' ? (
          <button
            type="button"
            className="mini-btn is-primary"
            onClick={() => void send({ cmd: 'pause' })}
          >
            일시정지
          </button>
        ) : (
          <button
            type="button"
            className="mini-btn is-primary"
            onClick={() => void send({ cmd: 'resume' })}
          >
            계속
          </button>
        )}
        {!idle && (
          <button type="button" className="mini-btn" onClick={() => void send({ cmd: 'reset' })}>
            초기화
          </button>
        )}
        {t.pomodoro && (
          <button
            type="button"
            className="mini-btn"
            onClick={() => void send({ cmd: 'pomodoro.skip' })}
          >
            건너뛰기
          </button>
        )}
      </div>
    </div>
  )
}
