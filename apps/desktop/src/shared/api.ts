import type {
  Asset,
  CalendarEvent,
  Settings,
  Theme,
  ThemeRule,
  TimerState,
  TodoItem,
  TodoList,
} from '@kkumikkumi/schema'
import type { Channel } from './channels'

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
      patch: { title?: string; done?: boolean; dueDate?: string | null; listId?: string }
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
  'timer.get': { in: undefined; out: TimerState | null }
  'timer.save': { in: { state: Omit<TimerState, 'updatedAt'> }; out: TimerState }
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

export type IpcError = { code: string }
export type IpcResult<T> = { ok: true; value: T } | { ok: false; error: IpcError }

export interface KkumiApi {
  readonly platform: string
  /**
   * 창을 닫기 직전에 호출된다(저장 마무리용). cb가 끝나면(최대 약 1.5초) 창이 닫힌다. 마지막 등록만 유효.
   */
  onBeforeClose(cb: () => Promise<void> | void): void
  invoke<C extends Channel>(
    channel: C,
    ...args: IpcSpec[C]['in'] extends undefined ? [] : [input: IpcSpec[C]['in']]
  ): Promise<IpcResult<IpcSpec[C]['out']>>
}
