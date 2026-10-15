import type {
  PomodoroSettings,
  TimerSession,
  TimerState,
  TodoItem,
  TodoList,
} from '@kkumikkumi/schema'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { IpcResult, TimerDoneInfo } from '../../../shared/api'
import type { BoardActions, BoardData, EditorTarget, TodoData } from '../board/BoardContext'
import { localDayStart, type EventInput } from '../board/calendar'
import { sortUpcoming } from '../board/dday'

// 사용자 데이터(투두/일정/타이머)를 IPC로 읽고 쓰는 훅. 테마(에디터 상태)와는 독립.
// 투두는 바뀔 때마다 전체를 다시 읽는다(로컬 SQLite라 충분히 빠르고 상태가 어긋나지 않는다).

const ERROR_TEXT: Record<string, string> = {
  invalid_input: '입력을 확인해 주세요',
  not_found: '이미 지워진 항목이에요',
}
const errText = (code: string) => ERROR_TEXT[code] ?? `저장하지 못했어요 (${code})`

async function loadTodos(): Promise<TodoData | null> {
  // items.list(null)이 기본 목록을 보장하고 알려 준다
  const def = await window.kkumi.invoke('todo.items.list', { listId: null })
  const lists = await window.kkumi.invoke('todo.lists.list')
  if (!def.ok || !lists.ok) return null
  const items: Record<string, TodoItem[]> = { [def.value.list.id]: def.value.items }
  for (const l of lists.value) {
    if (items[l.id]) continue
    const r = await window.kkumi.invoke('todo.items.list', { listId: l.id })
    if (r.ok) items[l.id] = r.value.items
  }
  return { lists: lists.value, defaultListId: def.value.list.id, items }
}

export interface UserData {
  data: BoardData
  actions: BoardActions
  lists: {
    all: readonly TodoList[]
    create(name: string): Promise<TodoList | null>
    rename(id: string, name: string): Promise<boolean>
    remove(id: string): Promise<boolean>
  }
  events: {
    create(e: EventInput): Promise<boolean>
    update(id: string, e: EventInput): Promise<boolean>
    remove(id: string): Promise<boolean>
  }
  /** 일정 입력 창 대상(null이면 닫힘) */
  editing: EditorTarget | null
  closeEditor(): void
  timer: {
    /** 끝난 시각이 [fromMs, toMs) 안인 기록 */
    sessions(fromMs: number, toMs: number): Promise<TimerSession[]>
    updatePomodoro(patch: Partial<PomodoroSettings>): Promise<boolean>
  }
  /** 앱 안 타이머 완료 표시 */
  timerDone: TimerDoneInfo | null
  dismissTimerDone(): void
}

/** onError는 안정적인 함수(setState 등)를 넘긴다 */
export function useUserData(onError: (text: string) => void): UserData {
  const [todos, setTodos] = useState<TodoData | undefined>()
  const [timer, setTimer] = useState<TimerState | undefined>()
  const [pomodoro, setPomodoro] = useState<PomodoroSettings | undefined>()
  const [version, setVersion] = useState(0)
  const [editing, setEditing] = useState<UserData['editing']>(null)
  const [timerDone, setTimerDone] = useState<TimerDoneInfo | null>(null)

  const refreshTodos = useCallback(async () => {
    const t = await loadTodos()
    if (t) setTodos(t)
    setVersion((v) => v + 1)
  }, [])

  /** IPC 결과 처리: 실패면 안내하고 false. 성공하면 투두/버전 갱신. */
  const run = useCallback(
    async <T>(p: Promise<IpcResult<T>>, refresh = true): Promise<T | null> => {
      const r = await p
      if (!r.ok) {
        onError(errText(r.error.code))
        if (refresh) await refreshTodos() // 낙관적 변경 되돌리기
        return null
      }
      if (refresh) await refreshTodos()
      return r.value
    },
    [refreshTodos, onError],
  )
  /** 결과 값이 없는(null을 돌려주는) 채널용: 성공 여부만. run의 null은 실패와 구분되지 않는다. */
  const runOk = useCallback(
    async (p: Promise<IpcResult<unknown>>): Promise<boolean> => {
      let ok = false
      await run(
        p.then((r) => {
          ok = r.ok
          return r
        }),
      )
      return ok
    },
    [run],
  )

  useEffect(() => {
    // 비동기 로드 결과를 상태에 넣는다(마운트 시 한 번)
    void (async () => {
      await refreshTodos()
      const t = await window.kkumi.invoke('timer.get')
      if (t.ok) setTimer(t.value)
      const p = await window.kkumi.invoke('timer.pomodoro.get')
      if (p.ok) setPomodoro(p.value)
      const missed = await window.kkumi.invoke('timer.takeMissedDone')
      if (missed.ok && missed.value) setTimerDone(missed.value)
    })()
    window.kkumi.onTimerChanged(setTimer)
    window.kkumi.onTimerDone(setTimerDone)
  }, [refreshTodos])

  const actions = useMemo<BoardActions>(
    () => ({
      todo: {
        create: async (listId, title, dueDate) =>
          (await run(window.kkumi.invoke('todo.items.create', { listId, title, dueDate }))) !==
          null,
        update: async (id, patch) => {
          // 체크는 바로 보이게(낙관적), 실패하면 run이 다시 읽어 되돌린다
          setTodos((t) => t && patchItem(t, id, patch))
          return (await run(window.kkumi.invoke('todo.items.update', { id, patch }))) !== null
        },
        remove: (id) => runOk(window.kkumi.invoke('todo.items.delete', { id })),
        reorder: async (listId, ids) => {
          setTodos((t) => t && reorderLocal(t, listId, ids))
          return runOk(window.kkumi.invoke('todo.items.reorder', { listId, ids }))
        },
      },
      calendar: {
        range: async (q) => (await run(window.kkumi.invoke('calendar.range', q), false)) ?? [],
        dueTodos: async (fromDate, toDate) =>
          (await run(window.kkumi.invoke('todo.items.dueBetween', { fromDate, toDate }), false)) ??
          [],
        get: async (id) => {
          const r = await window.kkumi.invoke('calendar.get', { id })
          return r.ok ? r.value : undefined
        },
        upcoming: async (today, limit) => {
          const r = await run(
            window.kkumi.invoke('calendar.upcoming', {
              fromUtc: localDayStart(today),
              fromDate: today,
              limit,
            }),
            false,
          )
          return sortUpcoming(r ?? []).slice(0, limit)
        },
        openEditor: setEditing,
      },
      timer: {
        command: (c) => {
          void (async () => {
            const r = await window.kkumi.invoke('timer.command', c)
            if (r.ok) setTimer(r.value)
            else onError(errText(r.error.code))
          })()
        },
      },
    }),
    [run, runOk, onError],
  )

  const lists = useMemo<UserData['lists']>(
    () => ({
      all: todos?.lists ?? [],
      create: (name) => run(window.kkumi.invoke('todo.lists.create', { name })),
      rename: async (id, name) =>
        (await run(window.kkumi.invoke('todo.lists.update', { id, name }))) !== null,
      remove: (id) => runOk(window.kkumi.invoke('todo.lists.delete', { id })),
    }),
    [run, runOk, todos?.lists],
  )

  const events = useMemo<UserData['events']>(
    () => ({
      create: async (e) =>
        (await run(window.kkumi.invoke('calendar.create', { event: { ...e } }))) !== null,
      update: async (id, e) =>
        (await run(window.kkumi.invoke('calendar.update', { event: { ...e, id } }))) !== null,
      remove: (id) => runOk(window.kkumi.invoke('calendar.delete', { id })),
    }),
    [run, runOk],
  )

  const data = useMemo<BoardData>(
    () => ({
      ...(todos ? { todos } : {}),
      ...(timer ? { timer } : {}),
      ...(pomodoro ? { pomodoro } : {}),
      version,
    }),
    [todos, timer, pomodoro, version],
  )

  const timerApi = useMemo<UserData['timer']>(
    () => ({
      sessions: async (fromMs, toMs) =>
        (await run(window.kkumi.invoke('timer.sessions', { fromMs, toMs }), false)) ?? [],
      updatePomodoro: async (patch) => {
        const r = await run(window.kkumi.invoke('timer.pomodoro.update', { patch }), false)
        if (r) setPomodoro(r)
        return r !== null
      },
    }),
    [run],
  )

  return {
    data,
    actions,
    lists,
    events,
    editing,
    closeEditor: () => setEditing(null),
    timer: timerApi,
    timerDone,
    dismissTimerDone: () => setTimerDone(null),
  }
}

function patchItem(t: TodoData, id: string, patch: Partial<TodoItem>): TodoData {
  const items: Record<string, readonly TodoItem[]> = {}
  for (const [k, list] of Object.entries(t.items)) {
    items[k] = list.map((i) => (i.id === id ? { ...i, ...patch } : i))
  }
  return { ...t, items }
}

function reorderLocal(t: TodoData, listId: string, ids: string[]): TodoData {
  const cur = t.items[listId]
  if (!cur) return t
  const pos = new Map(ids.map((id, i) => [id, i]))
  const next = cur.map((i) => ({ ...i, order: pos.get(i.id) ?? i.order }))
  return { ...t, items: { ...t.items, [listId]: next.sort((a, b) => a.order - b.order) } }
}
