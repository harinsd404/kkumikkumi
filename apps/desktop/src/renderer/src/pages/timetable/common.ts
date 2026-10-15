import type { TimetableEntry, TimetableSettings, TimetableSlot } from '@kkumikkumi/schema'

// 시간표 페이지 조각들이 같이 쓰는 타입과 값

/** 고른 것: 교시 칸 / 시간 항목 / 아직 저장 안 한 새 시간 항목 */
export type Sel =
  | { kind: 'cell'; day: number; period: number }
  | { kind: 'entry'; id: string }
  | { kind: 'new'; slot: Extract<TimetableSlot, { kind: 'time' }> }

/** 칸 색: 자동 색 번호(과목 → 톤) + 테마 톤 색 */
export interface Colors {
  auto: ReadonlyMap<string, number>
  tones: readonly string[]
}

export interface GridProps {
  colors: Colors
  settings: TimetableSettings
  entries: readonly TimetableEntry[]
  days: number[]
  today: number
  minute: number
  sel: Sel | null
  onSelect(sel: Sel | null): void
}

export const NEW_NAME = '새 시간표'
