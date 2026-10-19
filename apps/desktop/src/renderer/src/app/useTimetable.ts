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
  not_found: '없는 시간표나 칸이에요',
}

async function fetchData(): Promise<TimetableData | null> {
  const r = await window.kkumi.invoke('timetable.get')
  return r.ok ? r.value : null
}

export interface TimetableStore {
  data: TimetableData | undefined
  /** 만든 항목(실패하면 null) */
  create(
    timetableId: string,
    slot: TimetableSlot,
    content: TimetableContent,
  ): Promise<TimetableEntry | null>
  update(
    id: string,
    patch: { slot?: TimetableSlot; content?: Partial<TimetableContent> },
  ): Promise<boolean>
  remove(id: string): Promise<boolean>
  /** 새 시간표(copyFrom이면 복제). 만든 시간표가 고른 상태가 된다. */
  createTimetable(name: string, copyFrom?: string): Promise<boolean>
  updateTimetable(
    id: string,
    patch: { name?: string; settings?: Partial<TimetableSettings> },
  ): Promise<boolean>
  removeTimetable(id: string): Promise<boolean>
  /** 고른 시간표 바꾸기(블록의 "따라가기"도 같이 바뀐다) */
  select(id: string): Promise<boolean>
}

/** onError는 안정적인 함수(setState 등)를 넘긴다 */
export function useTimetable(onError: (text: string) => void): TimetableStore {
  const [data, setData] = useState<TimetableData | undefined>()

  const reload = useCallback(async () => {
    const v = await fetchData()
    if (v) setData(v)
  }, [])

  useEffect(() => {
    void fetchData().then((v) => v && setData(v))
  }, [])

  useEffect(
    () =>
      window.kkumi.onDataChanged((domain) => {
        if (domain === 'timetable') void reload()
      }),
    [reload],
  )

  const fail = useCallback(
    async (r: IpcResult<unknown>, text?: Record<string, string>) => {
      if (r.ok) return true
      onError(
        text?.[r.error.code] ?? ERROR_TEXT[r.error.code] ?? `저장하지 못했어요 (${r.error.code})`,
      )
      await reload()
      return false
    },
    [onError, reload],
  )

  return useMemo<TimetableStore>(
    () => ({
      data,
      create: async (timetableId, slot, content) => {
        const r = await window.kkumi.invoke('timetable.entries.create', {
          timetableId,
          slot,
          content,
        })
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
      createTimetable: async (name, copyFrom) => {
        const r = await window.kkumi.invoke(
          'timetables.create',
          copyFrom === undefined ? { name } : { name, copyFrom },
        )
        if (r.ok) setData(r.value)
        return fail(r, { conflict: '시간표는 20개까지 만들 수 있어요' })
      },
      updateTimetable: async (id, patch) => {
        const r = await window.kkumi.invoke('timetables.update', { id, patch })
        if (r.ok) setData(r.value)
        return fail(r)
      },
      removeTimetable: async (id) => {
        const r = await window.kkumi.invoke('timetables.delete', { id })
        if (r.ok) setData(r.value)
        return fail(r)
      },
      select: async (id) => {
        setData((d) => d && { ...d, activeId: id })
        return fail(await window.kkumi.invoke('timetables.select', { id }))
      },
    }),
    [data, fail],
  )
}
