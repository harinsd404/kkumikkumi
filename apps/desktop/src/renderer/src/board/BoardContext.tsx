import { createContext, useContext } from 'react'
import type { Theme, TodoItem, TodoList } from '@kkumikkumi/schema'

/** 사용 모드: 아무것도 움직이지 않음 / 편집 모드: M3 에디터에서 사용 */
export type BoardMode = 'use' | 'edit'

/** 블록이 표시할 사용자 데이터(테마와 독립). 없으면 빈 상태로 그린다. */
export interface BoardData {
  todo?: { list: TodoList; items: readonly TodoItem[] }
}

export interface BoardContextValue {
  mode: BoardMode
  theme: Theme
  /** 에셋 해시 → 표시용 URL. 매니페스트에 없으면 null. (앱이 주입: electron 의존 없음) */
  assetUrl(hash: string): string | null
  data: BoardData
  /** 현재 시각(테스트/미리보기에서 고정 가능) */
  now: Date
}

const Ctx = createContext<BoardContextValue | null>(null)

export const BoardProvider = Ctx.Provider

export function useBoard(): BoardContextValue {
  const v = useContext(Ctx)
  if (!v) throw new Error('BoardProvider 밖에서 useBoard 사용')
  return v
}
