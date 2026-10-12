/**
 * 실행 취소 기록(순수). 스냅샷 방식: 테마 전체가 작아서(수십 KB) 충분하다.
 * - 같은 groupKey의 연속 커밋은 하나로 합친다(드래그 = 한 동작). 드래그는 끝날 때 seal()로 묶음을 닫는다.
 * - mergeWindowMs 안의 같은 키 커밋도 합친다(슬라이더 연속 조작).
 */
export interface History<T> {
  past: readonly T[]
  present: T
  future: readonly T[]
  groupKey: string | null
  groupAt: number
}

export const HISTORY_LIMIT = 100
export const MERGE_WINDOW_MS = 500

export const createHistory = <T>(present: T): History<T> => ({
  past: [],
  present,
  future: [],
  groupKey: null,
  groupAt: 0,
})

export interface CommitOptions {
  groupKey?: string | null
  now?: number
  /** true면 시간과 무관하게 열린 묶음에 합친다(드래그 중) */
  continuous?: boolean
}

export function commit<T>(h: History<T>, next: T, o: CommitOptions = {}): History<T> {
  if (next === h.present) return h
  const key = o.groupKey ?? null
  const now = o.now ?? 0
  const merge =
    key !== null &&
    key === h.groupKey &&
    (o.continuous === true || now - h.groupAt <= MERGE_WINDOW_MS)
  if (merge) return { ...h, present: next, future: [], groupAt: now }
  const past = [...h.past, h.present]
  return {
    past: past.length > HISTORY_LIMIT ? past.slice(past.length - HISTORY_LIMIT) : past,
    present: next,
    future: [],
    groupKey: key,
    groupAt: now,
  }
}

/** 열린 묶음을 닫는다. 다음 커밋은 같은 키여도 새 기록이 된다. */
export const seal = <T>(h: History<T>): History<T> =>
  h.groupKey === null ? h : { ...h, groupKey: null }

export function undo<T>(h: History<T>): History<T> {
  const prev = h.past[h.past.length - 1]
  if (prev === undefined) return h
  return {
    past: h.past.slice(0, -1),
    present: prev,
    future: [h.present, ...h.future],
    groupKey: null,
    groupAt: 0,
  }
}

export function redo<T>(h: History<T>): History<T> {
  const [next, ...rest] = h.future
  if (next === undefined) return h
  return { past: [...h.past, h.present], present: next, future: rest, groupKey: null, groupAt: 0 }
}

export const canUndo = (h: History<unknown>) => h.past.length > 0
export const canRedo = (h: History<unknown>) => h.future.length > 0
