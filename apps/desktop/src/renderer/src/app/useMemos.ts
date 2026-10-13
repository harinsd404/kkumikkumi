import type { Memo } from '@kkumikkumi/schema'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { sortMemos, toggleCheck } from '../board/memoFormat'

// 메모(사용자 데이터)를 IPC로 읽고 쓰는 훅. 입력은 바로 화면에 반영하고 저장은 멈춘 뒤 0.5초에 묶어서 한다.
// 페이지를 옮겨도 남아 있도록 BoardScreen에 둔다.

const SAVE_DELAY_MS = 500

export interface MemoStore {
  /** 처음 읽기 전에는 undefined */
  memos: readonly Memo[] | undefined
  create(body?: string): Promise<Memo | null>
  /** 본문 입력(자동 저장 예약) */
  edit(id: string, body: string): void
  /** 체크리스트 한 줄 토글(바로 저장) */
  toggle(id: string, line: number): void
  setPinned(id: string, pinned: boolean): Promise<boolean>
  remove(id: string): Promise<boolean>
  /** 예약된 저장을 지금 한다 */
  flush(): Promise<void>
}

/** onError는 안정적인 함수(setState 등)를 넘긴다 */
export function useMemos(onError: (text: string) => void): MemoStore {
  const [memos, setMemos] = useState<Memo[] | undefined>()
  const memosRef = useRef<Memo[] | undefined>(undefined)
  const pending = useRef(new Map<string, string>())
  const timer = useRef<number | undefined>(undefined)
  const chain = useRef<Promise<void>>(Promise.resolve())

  const commit = useCallback((next: Memo[]) => {
    memosRef.current = next
    setMemos(next)
  }, [])
  const update = useCallback(
    (fn: (ms: Memo[]) => Memo[]) => {
      if (memosRef.current) commit(fn(memosRef.current))
    },
    [commit],
  )

  useEffect(() => {
    void (async () => {
      const r = await window.kkumi.invoke('memos.list')
      if (r.ok) commit(r.value)
      else onError('메모를 불러오지 못했어요')
    })()
  }, [commit, onError])

  const flush = useCallback((): Promise<void> => {
    window.clearTimeout(timer.current)
    // 순서대로 저장되도록 이어 붙인다
    chain.current = chain.current.then(async () => {
      const batch = [...pending.current]
      pending.current.clear()
      for (const [id, body] of batch) {
        const r = await window.kkumi.invoke('memos.update', { id, patch: { body } })
        if (r.ok) {
          // 저장하는 사이 더 입력했으면 화면의 본문은 그대로 두고 시각만 받는다
          const saved = r.value
          update((ms) =>
            sortMemos(
              ms.map((m) =>
                m.id === id ? (pending.current.has(id) ? { ...saved, body: m.body } : saved) : m,
              ),
            ),
          )
        } else if (r.error.code !== 'not_found') onError('메모를 저장하지 못했어요')
      }
    })
    return chain.current
  }, [update, onError])

  const edit = useCallback(
    (id: string, body: string) => {
      pending.current.set(id, body)
      update((ms) => ms.map((m) => (m.id === id ? { ...m, body } : m)))
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => void flush(), SAVE_DELAY_MS)
    },
    [update, flush],
  )

  useEffect(() => () => window.clearTimeout(timer.current), [])

  return useMemo<MemoStore>(
    () => ({
      memos,
      edit,
      flush,
      toggle: (id, line) => {
        const cur = memosRef.current?.find((m) => m.id === id)
        if (!cur) return
        const next = toggleCheck(cur.body, line)
        if (next === cur.body) return
        edit(id, next)
        void flush()
      },
      create: async (body) => {
        await flush()
        const r = await window.kkumi.invoke('memos.create', body === undefined ? {} : { body })
        if (!r.ok) {
          onError('메모를 만들지 못했어요')
          return null
        }
        update((ms) => sortMemos([r.value, ...ms]))
        return r.value
      },
      setPinned: async (id, pinned) => {
        update((ms) => sortMemos(ms.map((m) => (m.id === id ? { ...m, pinned } : m))))
        const r = await window.kkumi.invoke('memos.update', { id, patch: { pinned } })
        if (r.ok) return true
        update((ms) => sortMemos(ms.map((m) => (m.id === id ? { ...m, pinned: !pinned } : m))))
        onError('메모를 저장하지 못했어요')
        return false
      },
      remove: async (id) => {
        pending.current.delete(id)
        const r = await window.kkumi.invoke('memos.delete', { id })
        if (!r.ok && r.error.code !== 'not_found') {
          onError('메모를 지우지 못했어요')
          return false
        }
        update((ms) => ms.filter((m) => m.id !== id))
        return true
      },
    }),
    [memos, edit, flush, update, onError],
  )
}
