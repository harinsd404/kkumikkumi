import type {
  Asset,
  CalendarEvent,
  Memo,
  MiniTimerPrefs,
  PomodoroPhase,
  PomodoroSettings,
  Settings,
  Theme,
  ThemeRule,
  TimerSession,
  TimerState,
  TodoItem,
  TodoList,
} from '@kkumikkumi/schema'
import type { Channel } from './channels'
import type { TimerCommand, TimerMode } from './timer'

// renderer ↔ main 계약(타입만). 입력 검증 스키마는 main/ipc/handlers.ts에 있고 main이 항상 재검증한다.

export type ThemeSummary =
  | { id: string; ok: true; name: string; updatedAt: number }
  | { id: string; ok: false; error: string }

export type AssetPurpose = 'image' | 'pet'
export interface ImportedAsset {
  asset: Asset
  hasTransparency: boolean
}

type Id = { id: string }
type CalendarInput = Record<string, unknown>

export interface IpcSpec {
  'themes.list': { in: undefined; out: ThemeSummary[] }
  'themes.get': { in: Id; out: Theme }
  'themes.create': { in: { name: string }; out: Theme }
  'themes.save': { in: { theme: Theme }; out: Theme }
  'themes.duplicate': { in: { id: string; name: string }; out: Theme }
  'themes.rename': { in: { id: string; name: string }; out: Theme }
  'themes.delete': { in: Id; out: Settings }
  'themes.pruneAssets': { in: Id; out: { manifest: number; files: number } }
  'assets.importFromDialog': {
    in: { themeId: string; purpose: AssetPurpose }
    out: ImportedAsset | null
  }
  'assets.importBytes': {
    in: { themeId: string; purpose: AssetPurpose; bytes: Uint8Array }
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
    in: { listId: string | null; title: string; dueDate?: string | null }
    out: TodoItem
  }
  'todo.items.update': {
    in: {
      id: string
      patch: {
        title?: string
        done?: boolean
        dueDate?: string | null
        note?: string
        listId?: string
      }
    }
    out: TodoItem
  }
  'todo.items.delete': { in: Id; out: null }
  'todo.items.reorder': { in: { listId: string; ids: string[] }; out: null }
  'todo.items.dueBetween': { in: { fromDate: string; toDate: string }; out: TodoItem[] }
  'calendar.range': {
    in: { fromUtc: number; toUtc: number; fromDate: string; toDate: string }
    out: CalendarEvent[]
  }
  /** id/createdAt/updatedAt/recurrence는 main이 채운다 */
  'calendar.create': { in: { event: CalendarInput }; out: CalendarEvent }
  'calendar.update': { in: { event: CalendarInput & Id }; out: CalendarEvent }
  'calendar.delete': { in: Id; out: null }
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
  'themeRules.list': { in: undefined; out: ThemeRule[] }
  'themeRules.create': {
    in: { rule: Omit<ThemeRule, 'id' | 'createdAt' | 'updatedAt'> }
    out: ThemeRule
  }
  'themeRules.update': { in: { rule: Omit<ThemeRule, 'createdAt' | 'updatedAt'> }; out: ThemeRule }
  'themeRules.delete': { in: Id; out: null }
}

// 모든 채널에 스펙이 있는지 컴파일 타임에 확인
type _Exhaustive = Channel extends keyof IpcSpec
  ? keyof IpcSpec extends Channel
    ? true
    : never
  : never
export const _ipcSpecIsExhaustive: _Exhaustive = true

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
  invoke<C extends Channel>(
    channel: C,
    ...args: IpcSpec[C]['in'] extends undefined ? [] : [input: IpcSpec[C]['in']]
  ): Promise<IpcResult<IpcSpec[C]['out']>>
}
