import { createContext, useContext } from 'react'
import type {
  CalendarEvent,
  GridBlock,
  Habit,
  Memo,
  PomodoroSettings,
  Theme,
  TimerSession,
  TimerState,
  TodoItem,
  TodoList,
  Sprint,
} from '@kkumikkumi/schema'
import type { TimetableData } from '../../../shared/api'
import type { TimerCommand } from '../../../shared/timer'
import type { CalendarRangeQuery } from './calendar'

/** 사용 모드: 아무것도 움직이지 않음 / 편집 모드: M3 에디터에서 사용 */
export type BoardMode = 'use' | 'edit'

export interface TodoData {
  lists: readonly TodoList[]
  /** 스프린트(시작 날짜 순). 없으면 빈 것으로 본다 */
  sprints?: readonly Sprint[]
  defaultListId: string
  /** listId → 항목(order 순) */
  items: Readonly<Record<string, readonly TodoItem[]>>
}

/** 습관과 체크(키: checkKey(habitId, date)) */
export interface HabitData {
  habits: readonly Habit[]
  checked: ReadonlySet<string>
}

/** 블록이 표시할 사용자 데이터(테마와 독립). 없으면 빈 상태로 그린다. */
export interface BoardData {
  todos?: TodoData
  habits?: HabitData
  timer?: TimerState
  /** 뽀모도로 설정(단계 표시 "집중 2/4"에 필요) */
  pomodoro?: PomodoroSettings
  /** 메모(고정 먼저, 최근 수정 순) */
  memos?: readonly Memo[]
  /** 시간표(설정 + 항목) */
  timetable?: TimetableData
  /** 사용자 데이터가 바뀔 때마다 증가(캘린더 블록이 다시 조회하는 신호) */
  version?: number
}

export type TodoPatch = {
  title?: string
  done?: boolean
  dueDate?: string | null
  note?: string
  listId?: string
  /** 스프린트에 넣기/빼기(null) */
  sprintId?: string | null
}

/** 일정 입력 창 대상: 새 일정(날짜, 시간 칸에서 열면 시각도) 또는 기존 일정 */
export type EditorTarget = { date: string; time?: string } | { event: CalendarEvent }

/** 세부 페이지가 있는 블록 타입 */
export type PageType = 'todo' | 'calendar' | 'timer' | 'memo' | 'timetable' | 'habits'

/**
 * 블록이 사용자 데이터를 바꾸는 통로. 앱이 IPC로 구현해 주입한다(보드는 electron에 의존하지 않음).
 * 없으면(미리보기/테스트) 블록은 읽기 전용으로 그린다. 편집 모드에서는 조회만 하고 바꾸지 않는다.
 */
export interface BoardActions {
  todo: {
    create(
      listId: string,
      title: string,
      dueDate: string | null,
      sprintId?: string | null,
    ): Promise<boolean>
    update(id: string, patch: TodoPatch): Promise<boolean>
    remove(id: string): Promise<boolean>
    reorder(listId: string, ids: string[]): Promise<boolean>
  }
  calendar: {
    range(q: CalendarRangeQuery): Promise<CalendarEvent[]>
    dueTodos(fromDate: string, toDate: string): Promise<TodoItem[]>
    /** 일정 하나. 없으면 null, 불러오지 못하면 undefined */
    get(id: string): Promise<CalendarEvent | null | undefined>
    /** today(로컬 날짜) 이후 끝나지 않은 일정, 시작 순 최대 limit개 */
    upcoming(today: string, limit: number): Promise<CalendarEvent[]>
    /** 일정 입력 창 열기(보드 밖 앱 레이어) */
    openEditor(target: EditorTarget): void
  }
  timer: {
    command(c: TimerCommand): void
    /** 끝난 시각이 [fromMs, toMs) 안인 타이머 기록(공부 통계 블록). 불러오지 못하면 빈 배열 */
    sessions?(fromMs: number, toMs: number): Promise<TimerSession[]>
  }
  /** 메모 체크리스트 한 줄 토글(없으면 메모 블록은 읽기 전용) */
  memo?: {
    toggle(id: string, line: number): void
  }
  /** 고른 시간표 바꾸기(따라가는 시간표 블록 머리에서). 없으면 이름만 보여 준다. */
  timetable?: {
    select(id: string): void
  }
  /** 습관 체크(없으면 습관 블록은 읽기 전용) */
  habits?: {
    toggle(habitId: string, date: string, done: boolean): void
  }
  /** 블록의 세부 페이지 열기(사용 모드에서 블록 빈 곳 클릭). 없는 타입은 열지 않는다. 메모는 블록의 메모를 연다. */
  pages?: Partial<Record<PageType, (block: GridBlock) => void>>
}

export interface BoardContextValue {
  mode: BoardMode
  theme: Theme
  /** 에셋 해시 → 표시용 URL. 매니페스트에 없으면 null. (앱이 주입: electron 의존 없음) */
  assetUrl(hash: string): string | null
  data: BoardData
  actions?: BoardActions | undefined
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
