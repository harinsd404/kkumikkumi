import type {
  TimetableContent,
  TimetableEntry,
  TimetableSettings,
  TimetableSlot,
} from '@kkumikkumi/schema'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { IpcResult, TimetableData } from '../../../shared/api'

// 시간표(사용자 데이터)를 IPC로 읽고 쓰는 훅. 바꿀 때마다 결과로 상태를 갱신하고, 실패하면 다시 읽는다.

const ERROR_TEXT: Record<string, string> = {
  conflict: '이미 채워진 칸이에요',
  invalid_input: '입력을 확인해 주세요 (시각은 시작이 끝보다 앞, 교시끼리 겹치지 않게)',
  not_found: '없는 칸이에요',
}

export interface TimetableStore {
  data: TimetableData | undefined
  /** 만든 항목(실패하면 null) */
  create(slot: TimetableSlot, content: TimetableContent): Promise<TimetableEntry | null>
  update(
    id: string,
    patch: { slot?: TimetableSlot; content?: Partial<TimetableContent> },
  ): Promise<boolean>
  remove(id: string): Promise<boolean>
  updateSettings(patch: Partial<TimetableSettings>): Promise<boolean>
}

/** onError는 안정적인 함수(setState 등)를 넘긴다 */
export function useTimetable(onError: (text: string) => void): TimetableStore {
  const [data, setData] = useState<TimetableData | undefined>()

  const reload = useCallback(async () => {
    const r = await window.kkumi.invoke('timetable.get')
    if (r.ok) setData(r.value)
  }, [])

  useEffect(() => {
    void (async () => {
      const r = await window.kkumi.invoke('timetable.get')
      if (r.ok) setData(r.value)
    })()
  }, [])

  const fail = useCallback(
    async (r: IpcResult<unknown>) => {
      if (r.ok) return true
      onError(ERROR_TEXT[r.error.code] ?? `저장하지 못했어요 (${r.error.code})`)
      await reload()
      return false
    },
    [onError, reload],
  )

  return useMemo<TimetableStore>(
    () => ({
      data,
      create: async (slot, content) => {
        const r = await window.kkumi.invoke('timetable.entries.create', { slot, content })
        if (r.ok) {
          setData((d) => d && { ...d, entries: [...d.entries, r.value] })
          return r.value
        }
        await fail(r)
        return null
      },
      update: async (id, patch) => {
        const r = await window.kkumi.invoke('timetable.entries.update', { id, ...patch })
        if (r.ok)
          setData((d) => d && { ...d, entries: d.entries.map((e) => (e.id === id ? r.value : e)) })
        return fail(r)
      },
      remove: async (id) => {
        const r = await window.kkumi.invoke('timetable.entries.delete', { id })
        if (r.ok) setData((d) => d && { ...d, entries: d.entries.filter((e) => e.id !== id) })
        return fail(r)
      },
      updateSettings: async (patch) => {
        const r = await window.kkumi.invoke('timetable.settings.update', { patch })
        if (r.ok) setData(r.value)
        return fail(r)
      },
    }),
    [data, fail],
  )
}
