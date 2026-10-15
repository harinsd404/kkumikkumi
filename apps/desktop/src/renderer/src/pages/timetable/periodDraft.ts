import type { TimetableEntry, TimetableSettings } from '@kkumikkumi/schema'

// 교시 시각 편집 판정(순수 함수). 시각은 "HH:MM" 문자열이라 문자열 비교가 곧 시각 비교다.

type Periods = TimetableSettings['periods']

/** 저장된 교시와 다른지 */
export const periodsChanged = (draft: Periods, saved: Periods): boolean =>
  JSON.stringify(draft) !== JSON.stringify(saved)

/** 시각이 잘못된 첫 교시의 번호(0부터). 끝이 시작보다 뒤가 아니거나 앞 교시와 겹치면. 없으면 -1. */
export const badPeriodIndex = (draft: Periods): number =>
  draft.findIndex((p, i) => p.start >= p.end || (i > 0 && p.start < draft[i - 1]!.end))

/** 교시를 count개로 줄이면 지워지는 교시 칸 수 */
export const removedCells = (
  entries: readonly Pick<TimetableEntry, 'slot'>[],
  count: number,
): number => entries.filter((e) => e.slot.kind === 'period' && e.slot.period > count).length

/** i번째 교시의 시작/끝을 바꾼 새 목록 */
export const setPeriodTime = (
  draft: Periods,
  i: number,
  key: 'start' | 'end',
  value: string,
): Periods => draft.map((p, j) => (j === i ? { ...p, [key]: value } : p))
