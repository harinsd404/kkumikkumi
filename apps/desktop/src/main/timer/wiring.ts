import { randomUUID } from 'node:crypto'
import { DEFAULT_POMODORO } from '@kkumikkumi/schema'
import { BrowserWindow, Notification, powerMonitor } from 'electron'
import type { TimerDoneInfo } from '../../shared/api'
import { PHASE_LABEL } from '../../shared/pomodoro'
import { isFocusing } from '../../shared/timer'
import type { AppCore } from '../bootstrap'
import { bus } from '../events'
import { TimerService } from './timerService'
import { logError } from '../log'

/** 창이 없을 때 끝난 타이머. renderer가 timer.takeMissedDone으로 한 번 꺼내 간다. */
let missedTimerDone: TimerDoneInfo | null = null

export function takeMissedTimerDone(): TimerDoneInfo | null {
  const v = missedTimerDone
  missedTimerDone = null
  return v
}

const sendToWindows = (channel: string, value: unknown) => {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send(channel, value)
  }
}

const TIMER_DONE_TEXT = {
  focus: { title: '집중 시간이 끝났어요', body: '잠깐 쉬어 가요.' },
  break: { title: '쉬는 시간이 끝났어요', body: '다시 시작해 볼까요?' },
} as const

function timerDoneText(info: TimerDoneInfo): { title: string; body: string } {
  const base = TIMER_DONE_TEXT[info.mode]
  if (!info.next) return base
  const next = PHASE_LABEL[info.next.phase]
  return {
    title: base.title,
    body: info.next.started ? `${next} 시간이 시작됐어요.` : `다음은 ${next} 차례예요.`,
  }
}

/** 타이머는 main이 소유한다. 완료 알림은 시스템 알림 + 앱 안 표시(timer:done)를 항상 함께 보낸다. */
export function startTimerService(c: AppCore): TimerService {
  let focusing: boolean | null = null
  const svc = new TimerService({
    load: () => {
      try {
        return c.repos.timer.get()
      } catch {
        return null // 손상된 타이머 행은 기본값으로 시작
      }
    },
    save: (s) => c.repos.timer.save(s),
    now: Date.now,
    setTimer: (fn, ms) => setTimeout(fn, ms),
    clearTimer: (h) => clearTimeout(h as NodeJS.Timeout),
    onChange: (s) => {
      bus.emit('timer:changed', s)
      sendToWindows('timer:changed', s)
      const f = isFocusing(s)
      if (f !== focusing) bus.emit('focus:changed', (focusing = f))
    },
    onComplete: (info) => {
      bus.emit('timer:done', info)
      if (BrowserWindow.getAllWindows().length > 0) sendToWindows('timer:done', info)
      else missedTimerDone = info
      // 권한 상태를 조회할 API가 없어 거부 여부는 알 수 없다(docs/verified-facts.md). 앱 안 표시를 병행한다.
      if (Notification.isSupported()) new Notification(timerDoneText(info)).show()
    },
    pomodoro: () => {
      try {
        return c.repos.settings.pomodoro()
      } catch {
        return DEFAULT_POMODORO
      }
    },
    onSession: (s) => {
      try {
        c.repos.timerSessions.insert({ ...s, id: randomUUID() })
      } catch {
        // 기록 실패가 타이머를 멈추게 하지 않는다(로그에 사용자 데이터 없음)
        logError('[timer] 기록 저장 실패')
      }
    },
  })
  svc.init()
  focusing = isFocusing(svc.get())
  bus.emit('focus:changed', focusing)
  powerMonitor.on('resume', () => svc.recheck())
  return svc
}
