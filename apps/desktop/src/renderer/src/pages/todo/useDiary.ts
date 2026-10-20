import { ASSET_EXT_BY_MIME, type DiaryEntry, type DiaryPhoto } from '@kkumikkumi/schema'
import { useCallback, useMemo, useState } from 'react'
import type { DiarySummary } from '../../../../shared/api'
import { useKeyedAsync } from '../../board/useKeyedAsync'

export type DiarySave = Partial<Pick<DiaryEntry, 'body' | 'mood' | 'photos'>>

/** 일기 사진 표시 주소(main의 kkumi-asset 프로토콜, diary 폴더) */
export const diaryPhotoUrl = (p: DiaryPhoto) =>
  `kkumi-asset://diary/${p.hash}.${ASSET_EXT_BY_MIME[p.mime]}`

/**
 * 일기 읽기/쓰기(할 일 화면). 보이는 날짜 구간의 요약(달력 기분)과 고른 날의 일기.
 * 저장하면 버전을 올려 둘 다 다시 읽는다.
 */
export function useDiary(fromDate: string | undefined, toDate: string | undefined, date: string) {
  const [version, setVersion] = useState(0)
  const summaries = useKeyedAsync(
    `${fromDate}|${toDate}|${version}`,
    fromDate && toDate
      ? async () => {
          const r = await window.kkumi.invoke('diary.range', { fromDate, toDate })
          return r.ok ? r.value : []
        }
      : null,
  )
  const entry = useKeyedAsync(`${date}|${version}`, async () => {
    const r = await window.kkumi.invoke('diary.get', { date })
    return r.ok ? r.value : null
  })
  const moods = useMemo(
    () =>
      new Map(
        (summaries ?? []).flatMap((s: DiarySummary) =>
          s.mood !== null ? [[s.date, s.mood] as const] : [],
        ),
      ),
    [summaries],
  )
  const written = useMemo(() => new Set((summaries ?? []).map((s) => s.date)), [summaries])

  const save = useCallback(async (d: string, patch: DiarySave) => {
    const r = await window.kkumi.invoke('diary.save', { date: d, ...patch })
    setVersion((v) => v + 1)
    return r.ok
  }, [])
  const addPhoto = useCallback(
    async (src: { dialog: true } | { bytes: Uint8Array }): Promise<DiaryPhoto | null> => {
      const r =
        'dialog' in src
          ? await window.kkumi.invoke('diary.photoFromDialog')
          : await window.kkumi.invoke('diary.photoFromBytes', { bytes: src.bytes })
      return r.ok ? r.value : null
    },
    [],
  )
  return { entry, moods, written, save, addPhoto }
}

export type DiaryApi = ReturnType<typeof useDiary>
