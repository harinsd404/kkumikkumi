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
/** 사진 위치를 끌어서 조정하는 대상: 이미지 블록 / 꾸미기 사진 / 블록 배경 사진 */
export type AdjustTarget = { kind: 'block' | 'free' | 'blockBg'; id: string } | null

const ERROR_TEXT: Record<ReduceError, string> = {
  not_found: '대상을 찾을 수 없어요',
  no_space: '빈 자리가 없어요',
  collision: '다른 블록과 겹치거나 보드 밖이에요',
  no_room: '다른 블록을 옮길 빈 자리가 없어요',
  size_not_allowed: '이 블록은 그 크기를 쓸 수 없어요',
  locked: '잠긴 꾸미기예요. 잠금을 풀어 주세요',
  too_many: '꾸미기는 100개까지 넣을 수 있어요',
  background_not_color: '이미지 배경에서는 바꿀 수 없어요',
  image_background: '자유 크기를 쓰려면 스타일의 배경색을 투명으로 바꿔 주세요',
}

export interface EditorApi {
  theme: Theme
  selection: Selection
  select(s: Selection): void
  /** 사진 위치를 끌어서 조정하는 중인 이미지 블록/꾸미기(없으면 null) */
  adjusting: AdjustTarget
  adjust(s: AdjustTarget): void
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
  flush(): Promise<boolean>
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
  const [adjusting, setAdjusting] = useState<AdjustTarget>(null)
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
  const exists = (s: AdjustTarget) =>
    !!s && (s.kind === 'free' ? theme.freeItems : theme.blocks).some((x) => x.id === s.id)
  const live = useMemo<Selection>(() => {
    if (!selection) return null
    const kind = theme.blocks.some((b) => b.id === selection.id)
      ? 'block'
      : theme.freeItems.some((f) => f.id === selection.id)
        ? 'free'
        : null
    return kind === null ? null : kind === selection.kind ? selection : { ...selection, kind }
  }, [selection, theme.blocks, theme.freeItems])
  // 배경 사진 조정은 그 블록에 배경 사진이 아직 있을 때만(빼기 후 남은 조정 상태 정리)
  const liveAdjust =
    exists(adjusting) &&
    (adjusting?.kind !== 'blockBg' ||
      theme.blocks.some((b) => b.id === adjusting.id && b.style.bgImage))
      ? adjusting
      : null

  // 내용이 같으면 같은 객체(분 단위 시계 등으로 다시 그려질 때 [ed] 의존 콜백이 매번 바뀌지 않도록)
  return useMemo<EditorApi>(
    () => ({
      theme,
      selection: live,
      select: setSelection,
      adjusting: liveAdjust,
      adjust: setAdjusting,
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
    }),
    [theme, live, liveAdjust, dispatch, set, h, status, notice, autosaver],
  )
}
