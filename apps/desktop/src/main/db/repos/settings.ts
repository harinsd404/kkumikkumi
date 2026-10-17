import {
  ColorCombosSchema,
  DEFAULT_MCP_PREFS,
  DEFAULT_MINI_TIMER,
  DEFAULT_POMODORO,
  McpPrefsSchema,
  MiniTimerPrefsSchema,
  PomodoroSettingsSchema,
  SettingsSchema,
  TimetablePrefsSchema,
  type ColorCombo,
  type McpPrefs,
  type MiniTimerPrefs,
  type PomodoroSettings,
  type Settings,
  type TimetablePrefs,
} from '@kkumikkumi/schema'
import type { Db } from '../connection'
import { kvSetting, type KvSetting } from './kv'

/** 설정은 JSON 한 행으로 저장하고 읽을 때 SettingsSchema로 검증한다. */
export class SettingsRepo {
  private readonly app: KvSetting<Settings>
  private readonly pomodoroKv: KvSetting<PomodoroSettings>
  private readonly miniKv: KvSetting<MiniTimerPrefs>
  private readonly timetableKv: KvSetting<TimetablePrefs>
  private readonly combosKv: KvSetting<ColorCombo[]>
  private readonly mcpKv: KvSetting<McpPrefs>

  constructor(db: Db) {
    this.app = kvSetting(db, 'app', SettingsSchema)
    // 뽀모도로/미니 타이머/시간표 설정은 앱 설정과 따로 저장해 서로의 스키마 변경에 묶이지 않게 한다.
    this.pomodoroKv = kvSetting(db, 'pomodoro', PomodoroSettingsSchema)
    this.miniKv = kvSetting(db, 'miniTimer', MiniTimerPrefsSchema)
    this.timetableKv = kvSetting(db, 'timetablePrefs', TimetablePrefsSchema)
    this.combosKv = kvSetting(db, 'colorCombos', ColorCombosSchema)
    this.mcpKv = kvSetting(db, 'mcp', McpPrefsSchema)
  }

  /** 없으면 null. 손상됐으면 예외(bootstrap이 복구한다). */
  get(): Settings | null {
    return this.app.read() ?? null
  }

  save(settings: Settings): Settings {
    return this.app.save(settings)
  }

  /** 뽀모도로 설정(없거나 손상됐으면 기본값) */
  pomodoro(): PomodoroSettings {
    return this.pomodoroKv.readOr(DEFAULT_POMODORO)
  }

  savePomodoro(settings: PomodoroSettings): PomodoroSettings {
    return this.pomodoroKv.save(settings)
  }

  /** 미니 타이머 창 설정(없거나 손상됐으면 기본값) */
  miniTimer(): MiniTimerPrefs {
    return this.miniKv.readOr(DEFAULT_MINI_TIMER)
  }

  saveMiniTimer(prefs: MiniTimerPrefs): MiniTimerPrefs {
    return this.miniKv.save(prefs)
  }

  /** 시간표 전역 설정(없거나 손상됐으면 고른 시간표 없음 → 첫 시간표) */
  timetablePrefs(): TimetablePrefs {
    return this.timetableKv.readOr({ activeId: null })
  }

  saveTimetablePrefs(prefs: TimetablePrefs): TimetablePrefs {
    return this.timetableKv.save(prefs)
  }

  /** 내 색 조합(없거나 손상됐으면 빈 목록) */
  colorCombos(): ColorCombo[] {
    return this.combosKv.readOr([])
  }

  saveColorCombos(list: ColorCombo[]): ColorCombo[] {
    return this.combosKv.save(list)
  }

  /** 외부 AI 연결(MCP) 설정(없거나 손상됐으면 꺼짐) */
  mcp(): McpPrefs {
    return this.mcpKv.readOr(DEFAULT_MCP_PREFS)
  }

  saveMcp(prefs: McpPrefs): McpPrefs {
    return this.mcpKv.save(prefs)
  }
}
