import { EpochMs, MiniTimerPrefsSchema, PomodoroSettingsSchema } from '@kkumikkumi/schema'
import { z } from 'zod'
import { mergePatch, NoInput, TimerCommandSchema } from '../inputs'
import type { HandlerDeps, HandlersOf } from './deps'

/** 타이머(뽀모도로 포함) + 미니 타이머 창 */
export function timerHandlers(d: HandlerDeps): HandlersOf<'timer' | 'miniTimer'> {
  const { repos } = d
  return {
    'timer.get': async (i) => {
      NoInput.parse(i)
      return d.timer.get()
    },
    'timer.command': async (i) => d.timer.command(TimerCommandSchema.parse(i)),
    'timer.takeMissedDone': async (i) => {
      NoInput.parse(i)
      return d.takeMissedTimerDone?.() ?? null
    },
    'timer.sessions': async (i) => {
      const { fromMs, toMs } = z.strictObject({ fromMs: EpochMs, toMs: EpochMs }).parse(i)
      return repos.timerSessions.endedBetween(fromMs, toMs)
    },
    'timer.pomodoro.get': async (i) => {
      NoInput.parse(i)
      return repos.settings.pomodoro()
    },
    'timer.pomodoro.update': async (i) => {
      const { patch } = z.strictObject({ patch: PomodoroSettingsSchema.partial() }).parse(i)
      const saved = repos.settings.savePomodoro(
        mergePatch(PomodoroSettingsSchema, repos.settings.pomodoro(), patch),
      )
      d.timer.applySettings()
      return saved
    },

    /* ── 미니 타이머 창 ── */
    'miniTimer.open': async (i) => {
      NoInput.parse(i)
      d.miniTimer?.open()
      return null
    },
    'miniTimer.close': async (i) => {
      NoInput.parse(i)
      d.miniTimer?.close()
      return null
    },
    'miniTimer.prefs': async (i) => {
      NoInput.parse(i)
      return repos.settings.miniTimer()
    },
    'miniTimer.update': async (i) => {
      const { patch } = z.strictObject({ patch: MiniTimerPrefsSchema.partial() }).parse(i)
      const saved = repos.settings.saveMiniTimer(
        mergePatch(MiniTimerPrefsSchema, repos.settings.miniTimer(), patch),
      )
      d.miniTimer?.apply(saved)
      return saved
    },
  }
}
