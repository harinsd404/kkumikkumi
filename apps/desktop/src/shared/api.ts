import type {
  Asset,
  Palette,
  Pattern,
  ThemeLook,
  ThemeTemplateId,
  CalendarEvent,
  DiaryEntry,
  Habit,
  HabitCheck,
  DiaryPhoto,
  ColorCombo,
  LookColors,
  McpMode,
  Memo,
  MiniTimerPrefs,
  PomodoroPhase,
  PomodoroSettings,
  Settings,
  Sprint,
  Theme,
  ThemeRule,
  TimerSession,
  TimerState,
  Timetable,
  TimetableContent,
  TimetableEntry,
  TimetableSettings,
  TimetableSlot,
  TodoItem,
  TodoList,
} from '@kkumikkumi/schema'
import type { Channel } from './channels'
import type { TimerCommand, TimerMode } from './timer'

// renderer ↔ main 계약(타입만). 입력 검증 스키마는 main/ipc/handlers/에 있고 main이 항상 재검증한다.

/** 테마를 읽거나 쓰지 못한 이유(main의 ThemeStoreError 코드) */
export type ThemeErrorCode =
  | 'not_found'
  | 'invalid_id'
  | 'invalid_json'
  | 'invalid_schema'
  | 'future_version'
  | 'unsupported_version'
  | 'id_mismatch'
  | 'missing_asset_file'
  | 'last_theme'
  | 'builtin_theme'

export type ThemeSummary =
  | {
      id: string
      ok: true
      name: string
      updatedAt: number
      /** 앱 내장 기본 테마(이름 바꾸기/삭제 불가) */
      builtin: boolean
      /** 다른 테마 색을 고를 때 쓰는 대표색 */
      palette: Palette
      /** 배경이 색이면 그 색과 무늬 */
      bgColor: string | null
      pattern: Pattern | null
      fontId: string
    }
  | { id: string; ok: false; error: ThemeErrorCode }

export type AssetPurpose = 'image' | 'pet'
export interface ImportedAsset {
  asset: Asset
  hasTransparency: boolean
  /** 투명도가 없고 가장자리가 거의 흰색(스티커로 넣을 때 배경 지우기를 물어본다) */
  whiteBackground: boolean
}

type Id = { id: string }
type CalendarInput = Record<string, unknown>

/** 습관 만들기/고치기 입력 */
export interface HabitFields {
  name: string
  color?: string
  /** 하는 요일 비트(1 << 요일, 0=일). 127 = 매일 */
  days?: number
}

/** 달력에 표시할 일기 요약 */
export interface DiarySummary {
  date: string
  mood: number | null
  hasText: boolean
  photoCount: number
}

/** 스프린트 만들기/고치기 입력 */
export interface SprintFields {
  name: string
  goal?: string
  startDate: string
  endDate: string
  color?: string
}

export interface IpcSpec {
  'sync.status': { in: undefined; out: SyncStatus }
  'sync.connect': { in: { url: string; token: string; importLocal: boolean }; out: SyncStatus }
  'sync.disconnect': { in: undefined; out: SyncStatus }
  'sync.run': { in: { prefer?: 'local' | 'remote' }; out: SyncStatus }
  'themes.list': { in: undefined; out: ThemeSummary[] }
  'themes.get': { in: Id; out: Theme }
  'themes.create': { in: ThemeLook & { name: string; template: ThemeTemplateId }; out: Theme }
  'themes.save': { in: { theme: Theme }; out: Theme }
  'themes.duplicate': { in: { id: string; name: string }; out: Theme }
  'themes.rename': { in: { id: string; name: string }; out: Theme }
  'themes.delete': { in: Id; out: Settings }
  'themes.resetBuiltin': { in: Id; out: Theme }
  'themes.pruneAssets': { in: Id; out: { manifest: number; files: number } }
  'assets.importFromDialog': {
    in: { themeId: string; purpose: AssetPurpose }
    out: ImportedAsset | null
  }
  'assets.importBytes': {
    in: { themeId: string; purpose: AssetPurpose; bytes: Uint8Array }
    out: ImportedAsset
  }
  /** 이미 가져온 에셋의 흰 배경을 지우고 남은 그림 크기로 잘라 새 에셋으로(원본은 그대로). strength 0~100 */
  'assets.removeWhiteBackground': {
    in: { themeId: string; hash: string; strength: number }
    out: ImportedAsset
  }
  'settings.get': { in: undefined; out: Settings }
  'settings.update': {
    in: {
      patch: Partial<
        Pick<Settings, 'activeThemeId' | 'petEnabled' | 'autoSwitchEnabled' | 'manualOverride'>
      >
    }
    out: Settings
  }
  'todo.lists.list': { in: undefined; out: TodoList[] }
  'todo.lists.create': { in: { name: string }; out: TodoList }
  'todo.lists.update': { in: { id: string; name?: string; order?: number }; out: TodoList }
  'todo.lists.delete': { in: Id; out: null }
  /** listId가 null이면 기본 목록(없으면 생성) */
  'todo.items.list': { in: { listId: string | null }; out: { list: TodoList; items: TodoItem[] } }
  'todo.items.create': {
    in: { listId: string | null; title: string; dueDate?: string | null; sprintId?: string | null }
    out: TodoItem
  }
  'todo.items.update': {
    in: {
      id: string
      patch: {
        title?: string
        done?: boolean
        dueDate?: string | null
        sprintId?: string | null
        note?: string
        listId?: string
      }
    }
    out: TodoItem
  }
  'todo.items.delete': { in: Id; out: null }
  'todo.items.reorder': { in: { listId: string; ids: string[] }; out: null }
  /** 습관(순서대로) */
  'habits.list': { in: undefined; out: Habit[] }
  /** 최대 30개, 넘으면 conflict. days 생략하면 매일(127) */
  'habits.create': { in: HabitFields; out: Habit }
  'habits.update': { in: { id: string; patch: Partial<HabitFields> }; out: Habit }
  /** 체크 기록도 함께 지워진다 */
  'habits.delete': { in: Id; out: null }
  'habits.reorder': { in: { ids: string[] }; out: null }
  /** 기간 안 체크(최대 400일) */
  'habits.checks': { in: { fromDate: string; toDate: string }; out: HabitCheck[] }
  'habits.check': { in: { habitId: string; date: string; done: boolean }; out: null }
  /** 그날 일기(없으면 null) */
  'diary.get': { in: { date: string }; out: DiaryEntry | null }
  /** 기간 안 일기 요약(달력 표시용, 최대 400일) */
  'diary.range': { in: { fromDate: string; toDate: string }; out: DiarySummary[] }
  /** 준 값만 바꾼다. 글·기분·사진이 모두 비면 지우고 null */
  'diary.save': {
    in: {
      date: string
      body?: string
      mood?: number | null
      photos?: DiaryPhoto[]
    }
    out: DiaryEntry | null
  }
  'diary.delete': { in: { date: string }; out: null }
  /** 사진 고르기 → 재인코딩해 일기 사진 폴더에. 취소하면 null(아직 일기에 붙지 않음) */
  'diary.photoFromDialog': { in: undefined; out: DiaryPhoto | null }
  'diary.photoFromBytes': { in: { bytes: Uint8Array }; out: DiaryPhoto }
  /** 스프린트(시작 날짜 순) */
  'sprints.list': { in: undefined; out: Sprint[] }
  /** 최대 50개, 넘으면 conflict */
  'sprints.create': { in: SprintFields; out: Sprint }
  'sprints.update': { in: { id: string; patch: Partial<SprintFields> }; out: Sprint }
  /** 안의 할 일은 남고 연결만 끊긴다 */
  'sprints.delete': { in: Id; out: null }
  'todo.items.dueBetween': { in: { fromDate: string; toDate: string }; out: TodoItem[] }
  'calendar.range': {
    in: { fromUtc: number; toUtc: number; fromDate: string; toDate: string }
    out: CalendarEvent[]
  }
  /** id/createdAt/updatedAt/recurrence는 main이 채운다 */
  'calendar.create': { in: { event: CalendarInput }; out: CalendarEvent }
  'calendar.update': { in: { event: CalendarInput & Id }; out: CalendarEvent }
  'calendar.delete': { in: Id; out: null }
  /** 일정 하나(없으면 null: 디데이 블록이 "지워진 일정"을 보여 준다) */
  'calendar.get': { in: Id; out: CalendarEvent | null }
  /** 다가오는(진행 중 포함) 일정. 종류(시각/종일)마다 최대 limit개, 합친 정렬은 renderer가 */
  'calendar.upcoming': {
    in: { fromUtc: number; fromDate: string; limit: number }
    out: CalendarEvent[]
  }
  'timer.get': { in: undefined; out: TimerState }
  /** 타이머 상태는 main이 소유한다. renderer는 명령만 보낸다. */
  'timer.command': { in: TimerCommand; out: TimerState }
  /** 창이 없을 때 끝난 타이머(앱 시작 시 늦은 완료 등). 한 번 꺼내면 비워진다. */
  'timer.takeMissedDone': { in: undefined; out: TimerDoneInfo | null }
  /** 끝난 시각이 [fromMs, toMs) 안인 기록, 최근 순(최대 1000개) */
  'timer.sessions': { in: { fromMs: number; toMs: number }; out: TimerSession[] }
  'timer.pomodoro.get': { in: undefined; out: PomodoroSettings }
  'timer.pomodoro.update': { in: { patch: Partial<PomodoroSettings> }; out: PomodoroSettings }
  /** 미니 타이머 창 열기(이미 있으면 앞으로) / 닫기 */
  'miniTimer.open': { in: undefined; out: null }
  'miniTimer.close': { in: undefined; out: null }
  'miniTimer.prefs': { in: undefined; out: MiniTimerPrefs }
  'miniTimer.update': { in: { patch: Partial<MiniTimerPrefs> }; out: MiniTimerPrefs }
  /** 고정 먼저, 그다음 최근 수정 순 */
  'memos.list': { in: undefined; out: Memo[] }
  'memos.create': { in: { body?: string }; out: Memo }
  /** 고정만 바꾸면 updatedAt은 그대로(수정 순서가 흔들리지 않게) */
  'memos.update': { in: { id: string; patch: { body?: string; pinned?: boolean } }; out: Memo }
  'memos.delete': { in: Id; out: null }
  'timetable.get': { in: undefined; out: TimetableData }
  /** 이름으로 새 시간표를 만들거나 ID로 기존 시간표의 모든 항목을 원자적으로 교체한다. */
  'timetable.set': {
    in: {
      timetableId?: string
      name?: string
      settings?: Partial<TimetableSettings>
      entries: { slot: TimetableSlot; subject: string; room?: string; tone?: number | null }[]
    }
    out: TimetableData
  }
  /** 새 시간표(copyFrom이면 설정과 칸을 복제). 만든 시간표를 고른 상태로 바꾼다. 최대 개수면 conflict. */
  'timetables.create': { in: { name: string; copyFrom?: string }; out: TimetableData }
  /** 교시 수를 줄이면 뒤 교시 칸은 함께 지워진다(renderer가 먼저 확인). 결과는 전체 다시 읽기. */
  'timetables.update': {
    in: { id: string; patch: { name?: string; settings?: Partial<TimetableSettings> } }
    out: TimetableData
  }
  /** 칸/항목도 함께 지운다 */
  'timetables.delete': { in: Id; out: TimetableData }
  /** 고른 시간표 바꾸기(블록의 "따라가기"와 페이지가 이걸 보여 준다) */
  'timetables.select': { in: Id; out: null }
  /** 이미 채워진 교시 칸이면 conflict */
  'timetable.entries.create': {
    in: { timetableId: string; slot: TimetableSlot; content: TimetableContent }
    out: TimetableEntry
  }
  'timetable.entries.update': {
    in: { id: string; slot?: TimetableSlot; content?: Partial<TimetableContent> }
    out: TimetableEntry
  }
  'timetable.entries.delete': { in: Id; out: null }
  'themeRules.list': { in: undefined; out: ThemeRule[] }
  'themeRules.create': {
    in: { rule: Omit<ThemeRule, 'id' | 'createdAt' | 'updatedAt'> }
    out: ThemeRule
  }
  'themeRules.update': { in: { rule: Omit<ThemeRule, 'createdAt' | 'updatedAt'> }; out: ThemeRule }
  'themeRules.delete': { in: Id; out: null }
  'colorCombos.list': { in: undefined; out: ColorCombo[] }
  'colorCombos.add': { in: LookColors & { name: string }; out: ColorCombo }
  'colorCombos.delete': { in: Id; out: null }
  /** 외부 AI 연결(MCP) 상태 */
  'mcp.status': { in: undefined; out: McpStatus }
  /** 모드를 바꾸면 이미 연결된 AI 앱은 끊긴다(다시 연결해야 새 모드가 적용된다) */
  'mcp.update': { in: { mode: McpMode }; out: McpStatus }
  /** 설정 페이지 "정보" */
  'app.info': { in: undefined; out: { version: string } }
  /** Finder로 열기(허용된 폴더만) */
  'app.openFolder': { in: { folder: AppFolder }; out: null }
}

// 모든 채널에 스펙이 있는지 컴파일 타임에 확인
type _Exhaustive = Channel extends keyof IpcSpec
  ? keyof IpcSpec extends Channel
    ? true
    : never
  : never
export const _ipcSpecIsExhaustive: _Exhaustive = true

export interface TimetableData {
  /** 만든 순서 */
  timetables: Timetable[]
  /** 고른 시간표. 저장된 값이 없거나 지워졌으면 첫 시간표, 하나도 없으면 null. */
  activeId: string | null
  /** 모든 시간표의 칸/항목(timetableId로 나뉜다) */
  entries: TimetableEntry[]
}

export interface McpStatus {
  /** Windows uses the installed executable as a stdio bridge. No Node installation required. */
  bridgeCommand?: string
  mode: McpMode
  /** AI 앱이 연결할 소켓 경로(설정 안내용) */
  socketPath: string
  /** 소켓을 열어 연결을 받는 중 */
  listening: boolean
  /** 켰는데 열지 못한 이유 */
  error: 'path_too_long' | 'listen_failed' | null
}

export interface SyncStatus {
  url: string
  enabled: boolean
  busy: boolean
  pending: number
  conflicts: number
  error: string | null
  lastSyncedAt: number | null
}

/** 설정 페이지에서 Finder로 열 수 있는 폴더 */
export type AppFolder = 'logs' | 'userData'

/** 설정 페이지에서 바로 보여 줄 구역(앱 메뉴 "AI 연결…") */
export type SettingsSection = 'mcp'

/** 외부(MCP)에서 사용자 데이터가 바뀌었을 때 renderer가 다시 읽을 영역 */
export type DataDomain = 'todo' | 'calendar' | 'memos' | 'timetable' | 'habits'

export interface TimerDoneInfo {
  mode: TimerMode
  /** 앱이 꺼져 있거나 잠든 사이에 끝남 */
  late: boolean
  /** 뽀모도로면 이어지는 단계와 자동 시작 여부 */
  next: { phase: PomodoroPhase; started: boolean } | null
}

export type IpcError = { code: string }
export type IpcResult<T> = { ok: true; value: T } | { ok: false; error: IpcError }

export interface KkumiApi {
  readonly platform: string
  /**
   * 창을 닫기 직전에 호출된다(저장 마무리용). cb가 끝나면(최대 약 1.5초) 창이 닫힌다. 마지막 등록만 유효.
   */
  onBeforeClose(cb: () => Promise<void> | void): void
  /** main이 타이머 상태를 바꿀 때마다(완료 포함). 마지막 등록만 유효. */
  onTimerChanged(cb: (s: TimerState) => void): void
  /** 실행 중이던 타이머가 끝났을 때. 마지막 등록만 유효. */
  onTimerDone(cb: (info: TimerDoneInfo) => void): void
  /** 외부 AI 연결(MCP)로 사용자 데이터가 바뀌었을 때. 여러 곳에서 구독할 수 있다(돌려준 함수로 해제). */
  onDataChanged(cb: (domain: DataDomain) => void): () => void
  /** 앱 메뉴 "설정…"(section null) / "AI 연결…"(section 'mcp')을 눌렀을 때. 마지막 등록만 유효. */
  onOpenSettings(cb: (section: SettingsSection | null) => void): void
  invoke<C extends Channel>(
    channel: C,
    ...args: IpcSpec[C]['in'] extends undefined ? [] : [input: IpcSpec[C]['in']]
  ): Promise<IpcResult<IpcSpec[C]['out']>>
}
