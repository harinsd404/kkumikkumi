import type { MiniTimerPrefs, Settings } from '@kkumikkumi/schema'
import type { AssetPurpose, IpcSpec, TimerDoneInfo } from '../../../shared/api'
import type { Channel } from '../../../shared/channels'
import type { PipelineOptions } from '../../assets/pipeline'
import type { Db } from '../../db/connection'
import { NotFoundError, type Repos } from '../../db/repos'
import type { ThemeStore } from '../../themes/themeStore'
import type { TimerService } from '../../timer/timerService'

export interface HandlerDeps {
  db: Db
  repos: Repos
  themes: ThemeStore
  now(): number
  newId(): string
  /** 파일 선택 대화상자 → 파일 바이트. 취소하면 null. (electron 의존이라 주입) */
  pickImageFile(purpose: AssetPurpose): Promise<Uint8Array | null>
  pipeline?: PipelineOptions
  /** 고아 에셋 유예 시간 */
  pruneGraceMs?: number
  defaultListName?: string
  timer: Pick<TimerService, 'get' | 'command' | 'applySettings'>
  takeMissedTimerDone?(): TimerDoneInfo | null
  /** 투두 완료 이벤트 발행(이벤트 버스) */
  onTodoCompleted?(): void
  /** 미니 타이머 창 제어(electron 의존이라 주입) */
  miniTimer?: { open(): void; close(): void; apply(prefs: MiniTimerPrefs): void }
}

export type Handlers = { [C in Channel]: (input: unknown) => Promise<IpcSpec[C]['out']> }

/** 채널 이름 앞부분(예: 'themes')이 같은 핸들러 묶음 */
export type HandlersOf<P extends string> = Pick<Handlers, Extract<Channel, `${P}.${string}`>>

export const getSettings = (d: HandlerDeps): Settings => {
  const s = d.repos.settings.get()
  if (!s) throw new NotFoundError('settings')
  return s
}

export const assertTheme = async (d: HandlerDeps, id: string): Promise<void> => {
  await d.themes.read(id) // 없거나 손상이면 ThemeStoreError
}
