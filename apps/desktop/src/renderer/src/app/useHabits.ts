import type { Habit } from '@kkumikkumi/schema'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { HabitFields, IpcResult } from '../../../shared/api'
import { addDays, checkKey } from '../../../shared/habits'
import type { HabitData } from '../board/BoardContext'
import { localDate } from '../board/calendar'

/** 연속 기록을 셀 만큼 과거와 이번 주 끝까지(main 상한 400일 안) */
const PAST_DAYS = 392
const FUTURE_DAYS = 7

const ERROR_TEXT: Record<string, string> = {
  conflict: '습관은 30개까지 만들 수 있어요',
  invalid_input: '입력을 확인해 주세요',
  not_found: '이미 지워진 습관이에요',
}

async function fetchHabits(today: string): Promise<HabitData | null> {
  const [h, c] = await Promise.all([
    window.kkumi.invoke('habits.list'),
    window.kkumi.invoke('habits.checks', {
      fromDate: addDays(today, -PAST_DAYS),
      toDate: addDays(today, FUTURE_DAYS),
    }),
  ])
  if (!h.ok || !c.ok) return null
  return { habits: h.value, checked: new Set(c.value.map((x) => checkKey(x.habitId, x.date))) }
}

export interface HabitStore {
  data: HabitData | undefined
  toggle(habitId: string, date: string, done: boolean): void
  create(f: HabitFields): Promise<Habit | null>
  update(id: string, patch: Partial<HabitFields>): Promise<boolean>
  remove(id: string): Promise<boolean>
  reorder(ids: string[]): Promise<boolean>
}

/** 습관과 체크(최근 약 400일). 체크는 바로 보이게(낙관적) 바꾸고 실패하면 다시 읽는다. */
export function useHabits(onError: (text: string) => void): HabitStore {
  const [data, setData] = useState<HabitData | undefined>()
  // 읽기 세대: 바로 바꾼(낙관적) 변경이나 더 늦게 시작한 읽기가 있으면 이전 읽기 결과는 버린다
  const gen = useRef(0)
  const reload = useCallback(async () => {
    const my = ++gen.current
    const v = await fetchHabits(localDate(Date.now()))
    if (v && my === gen.current) setData(v)
  }, [])
  useEffect(() => {
    void reload()
  }, [reload])
  useEffect(
    () =>
      window.kkumi.onDataChanged((domain) => {
        if (domain === 'habits') void reload()
      }),
    [reload],
  )

  const done = useCallback(
    async (r: IpcResult<unknown>) => {
      if (!r.ok) onError(ERROR_TEXT[r.error.code] ?? `저장하지 못했어요 (${r.error.code})`)
      await reload()
      return r.ok
    },
    [onError, reload],
  )

  return useMemo<HabitStore>(
    () => ({
      data,
      toggle: (habitId, date, on) => {
        gen.current++
        setData((d) => {
          if (!d) return d
          const checked = new Set(d.checked)
          if (on) checked.add(checkKey(habitId, date))
          else checked.delete(checkKey(habitId, date))
          return { ...d, checked }
        })
        void window.kkumi.invoke('habits.check', { habitId, date, done: on }).then(async (r) => {
          if (r.ok) await reload()
          else await done(r)
        })
      },
      create: async (f) => {
        const r = await window.kkumi.invoke('habits.create', f)
        await done(r)
        return r.ok ? r.value : null
      },
      update: async (id, patch) => {
        // 바로 보이게(요일을 빠르게 여러 번 눌러도 앞의 변경 위에 쌓이도록)
        gen.current++
        setData(
          (d) => d && { ...d, habits: d.habits.map((h) => (h.id === id ? { ...h, ...patch } : h)) },
        )
        return done(await window.kkumi.invoke('habits.update', { id, patch }))
      },
      remove: async (id) => done(await window.kkumi.invoke('habits.delete', { id })),
      reorder: async (ids) => done(await window.kkumi.invoke('habits.reorder', { ids })),
    }),
    [data, done, reload],
  )
}
