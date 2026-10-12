import { parseTheme, type Theme } from '@kkumikkumi/schema'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createAutosaver, type Autosaver, type SaveStatus } from './state/autosave'
import {
  canRedo,
  canUndo,
  commit,
  createHistory,
  redo,
  seal,
  undo,
  type CommitOptions,
  type History,
} from './state/history'
import { reduce, type EditorAction, type ReduceError } from './state/reducer'

export type Selection = { kind: 'block' | 'free'; id: string } | null

const ERROR_TEXT: Record<ReduceError, string> = {
  not_found: '대상을 찾을 수 없어요',
  no_space: '빈 자리가 없어요',
  collision: '다른 블록과 겹치거나 보드 밖이에요',
  size_not_allowed: '이 블록은 그 크기를 쓸 수 없어요',
  locked: '잠긴 꾸미기예요. 잠금을 풀어 주세요',
  too_many: '꾸미기는 100개까지 넣을 수 있어요',
  background_not_color: '이미지 배경에서는 바꿀 수 없어요',
}

export interface EditorApi {
  theme: Theme
  selection: Selection
  select(s: Selection): void
  /** 실패하면 false(안내 문구를 띄움) */
  dispatch(a: EditorAction, o?: CommitOptions): boolean
  /** 드래그 등 연속 조작이 끝났을 때 */
  endGesture(): void
  undo(): void
  redo(): void
  canUndo: boolean
  canRedo: boolean
  status: SaveStatus
  notice: string | null
  showNotice(text: string): void
  flush(): Promise<void>
}

export interface EditorDeps {
  /** 안정적인(모듈 수준) 함수를 넘긴다. 바뀌면 자동 저장기가 새로 만들어진다. */
  save(theme: Theme): Promise<{ ok: true } | { ok: false; code: string }>
}

/** 상태 로직은 state/*의 순수 함수. 이 훅은 React 상태와 자동 저장만 연결한다. */
export function useEditor(initial: Theme, deps: EditorDeps): EditorApi {
  // 렌더는 state(h)를 읽고, 콜백은 ref(최신값)를 읽는다. 둘은 set()에서만 함께 바뀐다.
  const [h, setH] = useState<History<Theme>>(() => createHistory(initial))
  const hist = useRef(h)
  const [selection, setSelection] = useState<Selection>(null)
  const [status, setStatus] = useState<SaveStatus>({ state: 'idle' })
  const [notice, setNotice] = useState<string | null>(null)

  const autosaver = useMemo<Autosaver<Theme>>(
    () =>
      createAutosaver<Theme>({
        delayMs: 800,
        validate: (t) => {
          const r = parseTheme(t)
          return r.success ? null : (r.error.issues[0]?.message ?? '테마 형식 오류')
        },
        save: deps.save,
        onStatus: setStatus,
        now: Date.now,
        setTimer: (fn, ms) => window.setTimeout(fn, ms),
        clearTimer: (h) => window.clearTimeout(h as number),
      }),
    [deps.save],
  )
  useEffect(() => () => autosaver.dispose(), [autosaver])

  useEffect(() => {
    if (!notice) return
    const t = window.setTimeout(() => setNotice(null), 2500)
    return () => window.clearTimeout(t)
  }, [notice])

  const set = useCallback(
    (next: History<Theme>) => {
      const changed = next.present !== hist.current.present
      hist.current = next
      setH(next)
      if (changed) autosaver.schedule(next.present)
    },
    [autosaver],
  )

  const dispatch = useCallback(
    (a: EditorAction, o: CommitOptions = {}) => {
      const r = reduce(hist.current.present, a)
      if (!r.ok) {
        setNotice(ERROR_TEXT[r.error])
        return false
      }
      set(commit(hist.current, r.theme, { now: Date.now(), ...o }))
      return true
    },
    [set],
  )

  const theme = h.present
  // 실행 취소 등으로 선택한 요소가 사라졌으면 선택 해제로 본다
  const live =
    selection &&
    (selection.kind === 'block' ? theme.blocks : theme.freeItems).some((x) => x.id === selection.id)
      ? selection
      : null

  return {
    theme,
    selection: live,
    select: setSelection,
    dispatch,
    endGesture: () => set(seal(hist.current)),
    undo: () => set(undo(hist.current)),
    redo: () => set(redo(hist.current)),
    canUndo: canUndo(h),
    canRedo: canRedo(h),
    status,
    notice,
    showNotice: setNotice,
    flush: () => autosaver.flush(),
  }
}
