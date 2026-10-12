import { z } from 'zod'
import { EpochMs, HexColor, Uuid } from './theme'

/* ════════════════════════════════════════════════════════════
 * 사용자 데이터 스키마 (테마와 독립, 내보내기 제외)
 * 저장소: SQLite 권장. 아래는 행 단위 검증 + 타입 용도.
 * ════════════════════════════════════════════════════════════ */

export const DateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/) // 로컬 날짜 (타임존 무관)
const TimeOfDay = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)

const isValidTz = (tz: string) => {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

/* ───────── Todo ───────── */

export const TodoListSchema = z.strictObject({
  id: Uuid,
  name: z.string().trim().min(1).max(40),
  order: z.number().int(),
  createdAt: EpochMs,
  updatedAt: EpochMs,
})

export const TodoItemSchema = z.strictObject({
  id: Uuid,
  listId: Uuid,
  title: z.string().trim().min(1).max(200),
  done: z.boolean(),
  completedAt: EpochMs.nullable(),
  dueDate: DateStr.nullable(), // 캘린더 표시용 (시각 없는 날짜)
  order: z.number().int(),
  createdAt: EpochMs,
  updatedAt: EpochMs,
})

/* ───────── 캘린더 (내부 일정) ───────── */

const eventBase = {
  id: Uuid,
  title: z.string().trim().min(1).max(200),
  color: HexColor,
  note: z.string().max(2000),
  recurrence: z.null(), // MVP 제외, 필드만 예약
  createdAt: EpochMs,
  updatedAt: EpochMs,
}

const TimedEvent = z
  .strictObject({
    ...eventBase,
    allDay: z.literal(false),
    startUtc: EpochMs,
    endUtc: EpochMs,
    tzid: z.string().min(1).max(64).refine(isValidTz, '유효하지 않은 타임존'),
  })
  .refine((e) => e.endUtc >= e.startUtc, { path: ['endUtc'], message: '종료가 시작보다 빠름' })

const AllDayEvent = z
  .strictObject({
    ...eventBase,
    allDay: z.literal(true),
    startDate: DateStr,
    endDate: DateStr, // 포함(inclusive)
  })
  .refine((e) => e.endDate >= e.startDate, { path: ['endDate'], message: '종료가 시작보다 빠름' })

export const CalendarEventSchema = z.union([TimedEvent, AllDayEvent])

/* ───────── 타이머 ───────── */

/** 카운트다운은 setInterval이 아니라 endsAt 타임스탬프로 남은 시간을 계산 */
export const TimerStateSchema = z
  .strictObject({
    status: z.enum(['idle', 'running', 'paused']),
    mode: z.enum(['focus', 'break']),
    durationMs: z
      .number()
      .int()
      .min(1000)
      .max(24 * 3600 * 1000),
    endsAt: EpochMs.nullable(),
    pausedRemainingMs: z.number().int().nonnegative().nullable(),
    updatedAt: EpochMs,
  })
  .superRefine((s, ctx) => {
    if (s.status === 'running' && s.endsAt === null) {
      ctx.addIssue({ code: 'custom', path: ['endsAt'], message: 'running 상태는 endsAt 필요' })
    }
    if (s.status === 'paused' && s.pausedRemainingMs === null) {
      ctx.addIssue({
        code: 'custom',
        path: ['pausedRemainingMs'],
        message: 'paused 상태는 pausedRemainingMs 필요',
      })
    }
  })

/* ───────── 테마 자동 전환 규칙 (사용자 설정: 테마 내보내기에 포함하지 않음) ───────── */

export const ThemeRuleSchema = z.strictObject({
  id: Uuid,
  themeId: Uuid,
  enabled: z.boolean(),
  priority: z.number().int().min(0).max(1000), // 겹치면 큰 값 우선
  conditions: z.strictObject({
    // start > end 이면 자정을 넘기는 구간. null = 시간 무관
    timeRange: z
      .strictObject({ start: TimeOfDay, end: TimeOfDay })
      .refine((r) => r.start !== r.end, '시작과 종료가 같음')
      .nullable(),
    // 빈 배열 = 매일, 0=일 … 6=토
    weekdays: z
      .array(z.number().int().min(0).max(6))
      .max(7)
      .refine((a) => new Set(a).size === a.length, '중복된 요일'),
    mode: z.enum(['any', 'focus']), // focus = 타이머(집중) 실행 중
    appearance: z.enum(['any', 'light', 'dark']),
  }),
  createdAt: EpochMs,
  updatedAt: EpochMs,
})

/* ───────── 설정 ───────── */

export const SettingsSchema = z.strictObject({
  schemaVersion: z.literal(1),
  activeThemeId: Uuid,
  petEnabled: z.boolean(), // 펫 on/off는 전역 (펫 외형만 테마에 속함)
  autoSwitchEnabled: z.boolean(),
  // 수동 전환 처리: until=null → 직접 해제할 때까지 고정, 값 있으면 해당 시각까지 유지
  manualOverride: z.strictObject({ themeId: Uuid, until: EpochMs.nullable() }).nullable(),
})

/* ───────── 창 상태 (앱 상태: 테마/내보내기와 무관) ───────── */

export const WindowStateSchema = z.strictObject({
  x: z.number().int(),
  y: z.number().int(),
  width: z.number().int().min(1).max(20000),
  height: z.number().int().min(1).max(20000),
})

export type WindowState = z.infer<typeof WindowStateSchema>
export type TodoList = z.infer<typeof TodoListSchema>
export type TodoItem = z.infer<typeof TodoItemSchema>
export type CalendarEvent = z.infer<typeof CalendarEventSchema>
export type TimerState = z.infer<typeof TimerStateSchema>
export type ThemeRule = z.infer<typeof ThemeRuleSchema>
export type Settings = z.infer<typeof SettingsSchema>
