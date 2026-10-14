import {
  DEFAULT_MINI_TIMER,
  DEFAULT_POMODORO,
  MiniTimerPrefsSchema,
  PomodoroSettingsSchema,
  SettingsSchema,
  TimetablePrefsSchema,
  type MiniTimerPrefs,
  type PomodoroSettings,
  type Settings,
  type TimetablePrefs,
} from '@kkumikkumi/schema'
import type { Db } from '../connection'
import type { Row } from './rows'

const KEY = 'app'
const POMODORO_KEY = 'pomodoro'
const MINI_KEY = 'miniTimer'
const TIMETABLE_KEY = 'timetablePrefs'

/** 설정은 JSON 한 행으로 저장하고 읽을 때 SettingsSchema로 검증한다. */
export class SettingsRepo {
  constructor(private readonly db: Db) {}

  get(): Settings | null {
    const r = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(KEY) as
      Row | undefined
    return r ? SettingsSchema.parse(JSON.parse(String(r['value']))) : null
  }

  save(settings: Settings): Settings {
    const s = SettingsSchema.parse(settings)
    this.db
      .prepare(
        'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      )
      .run(KEY, JSON.stringify(s))
    return s
  }

  /** 뽀모도로 설정(없거나 손상됐으면 기본값). 앱 설정과 따로 저장해 서로의 스키마 변경에 묶이지 않게 한다. */
  pomodoro(): PomodoroSettings {
    const r = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(POMODORO_KEY) as
      Row | undefined
    if (!r) return DEFAULT_POMODORO
    const p = PomodoroSettingsSchema.safeParse(safeJson(String(r['value'])))
    return p.success ? p.data : DEFAULT_POMODORO
  }

  savePomodoro(settings: PomodoroSettings): PomodoroSettings {
    const s = PomodoroSettingsSchema.parse(settings)
    this.db
      .prepare(
        'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      )
      .run(POMODORO_KEY, JSON.stringify(s))
    return s
  }

  /** 미니 타이머 창 설정(없거나 손상됐으면 기본값) */
  miniTimer(): MiniTimerPrefs {
    const r = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(MINI_KEY) as
      Row | undefined
    if (!r) return DEFAULT_MINI_TIMER
    const p = MiniTimerPrefsSchema.safeParse(safeJson(String(r['value'])))
    return p.success ? p.data : DEFAULT_MINI_TIMER
  }

  saveMiniTimer(prefs: MiniTimerPrefs): MiniTimerPrefs {
    const s = MiniTimerPrefsSchema.parse(prefs)
    this.db
      .prepare(
        'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      )
      .run(MINI_KEY, JSON.stringify(s))
    return s
  }

  /** 시간표 전역 설정(없거나 손상됐으면 고른 시간표 없음 → 첫 시간표) */
  timetablePrefs(): TimetablePrefs {
    const r = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(TIMETABLE_KEY) as
      Row | undefined
    if (!r) return { activeId: null }
    const p = TimetablePrefsSchema.safeParse(safeJson(String(r['value'])))
    return p.success ? p.data : { activeId: null }
  }

  saveTimetablePrefs(prefs: TimetablePrefs): TimetablePrefs {
    const s = TimetablePrefsSchema.parse(prefs)
    this.db
      .prepare(
        'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      )
      .run(TIMETABLE_KEY, JSON.stringify(s))
    return s
  }
}

const safeJson = (s: string): unknown => {
  try {
    return JSON.parse(s)
  } catch {
    return null
  }
}
