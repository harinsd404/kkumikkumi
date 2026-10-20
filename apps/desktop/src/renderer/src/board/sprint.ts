import type { Sprint } from '@kkumikkumi/schema'
import { daysBetween } from './dday'

// 스프린트(기간 동안 끝낼 일 묶음) 계산(순수 함수). 날짜는 로컬 날짜 문자열, 끝 날 포함.

export type SprintStatus = 'upcoming' | 'active' | 'ended'

export const sprintStatus = (
  s: Pick<Sprint, 'startDate' | 'endDate'>,
  today: string,
): SprintStatus => (today < s.startDate ? 'upcoming' : today > s.endDate ? 'ended' : 'active')

/** 짧은 상태 표시: "D-12" / "오늘 마감" / "시작 전 · D-3" / "끝남" */
export function sprintBadge(s: Pick<Sprint, 'startDate' | 'endDate'>, today: string): string {
  const st = sprintStatus(s, today)
  if (st === 'upcoming') return `시작 전 · D-${daysBetween(today, s.startDate)}`
  if (st === 'ended') return '끝남'
  const left = daysBetween(today, s.endDate)
  return left === 0 ? '오늘 마감' : `D-${left}`
}

interface ItemLike {
  done: boolean
  sprintId: string | null
}

/** 스프린트 안의 할 일(모든 카테고리에서) */
export function sprintItems<T extends ItemLike>(
  items: Readonly<Record<string, readonly T[]>>,
  sprintId: string,
): T[] {
  return Object.values(items).flatMap((list) => list.filter((i) => i.sprintId === sprintId))
}

/** 끝낸 일 / 전체. 할 일이 없으면 비율 0 */
export function sprintProgress(items: readonly ItemLike[]): {
  done: number
  total: number
  ratio: number
} {
  const done = items.filter((i) => i.done).length
  return { done, total: items.length, ratio: items.length ? done / items.length : 0 }
}

/** 그날이 기간 안에 드는 스프린트 */
export const sprintsOn = <S extends Pick<Sprint, 'startDate' | 'endDate'>>(
  sprints: readonly S[],
  date: string,
): S[] => sprints.filter((s) => s.startDate <= date && date <= s.endDate)

/** 목록 순서: 진행 중(먼저 끝나는 순) → 예정(먼저 시작하는 순) → 끝남(최근에 끝난 순) */
export function sortSprints<S extends Sprint>(sprints: readonly S[], today: string): S[] {
  const rank = { active: 0, upcoming: 1, ended: 2 } as const
  return [...sprints].sort((a, b) => {
    const ra = rank[sprintStatus(a, today)]
    const rb = rank[sprintStatus(b, today)]
    if (ra !== rb) return ra - rb
    if (ra === 0) return a.endDate.localeCompare(b.endDate) || a.name.localeCompare(b.name)
    if (ra === 1) return a.startDate.localeCompare(b.startDate) || a.name.localeCompare(b.name)
    return b.endDate.localeCompare(a.endDate)
  })
}

/** 위젯 자동 선택: 진행 중 중 먼저 끝나는 것, 없으면 가장 가까운 예정, 없으면 null */
export function autoSprint<S extends Sprint>(sprints: readonly S[], today: string): S | null {
  const first = sortSprints(sprints, today)[0]
  return first && sprintStatus(first, today) !== 'ended' ? first : null
}

/** 새 스프린트 색 고르기(테마와 무관하게 잘 보이는 차분한 색) */
export const SPRINT_COLORS = ['#d9a86c', '#e58f8f', '#8fb8de', '#93c9a1', '#b79ad6', '#e7c35a']
