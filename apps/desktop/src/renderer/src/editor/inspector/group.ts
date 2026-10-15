import type { CommitOptions } from '../state/history'

/** 슬라이더 등 연속 조작을 실행 취소 한 번으로 묶는다. 대상(id)마다 따로 묶고, key가 없으면 묶지 않는다. */
export const groupOf = (id: string, key?: string): CommitOptions =>
  key ? { groupKey: `${key}:${id}` } : {}
