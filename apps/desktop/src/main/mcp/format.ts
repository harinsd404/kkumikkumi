import type { CalendarEvent, Memo, Sprint, TodoItem } from '@kkumikkumi/schema'

// MCP 도구 입출력 변환(순수 함수). 시각 일정은 앱 화면과 같게 시스템 타임존의 벽시계 시각으로 주고받는다.

const pad2 = (n: number) => String(n).padStart(2, '0')
const iso = (y: number, m0: number, d: number) => `${y}-${pad2(m0 + 1)}-${pad2(d)}`

/** ms → 로컬 'YYYY-MM-DD' */
export function localDateOf(ms: number): string {
  const t = new Date(ms)
  return iso(t.getFullYear(), t.getMonth(), t.getDate())
}

/** ms → 로컬 'YYYY-MM-DDTHH:mm+09:00' (AI가 오프셋까지 읽을 수 있게) */
export function localIso(ms: number): string {
  const t = new Date(ms)
  const off = -t.getTimezoneOffset()
  const sign = off >= 0 ? '+' : '-'
  const abs = Math.abs(off)
  return `${localDateOf(ms)}T${pad2(t.getHours())}:${pad2(t.getMinutes())}${sign}${pad2(Math.floor(abs / 60))}:${pad2(abs % 60)}`
}

/** 'YYYY-MM-DD'에 n일 더하기(달력 산술, DST 무관) */
export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  const t = new Date(Date.UTC(y, m - 1, d + n))
  return iso(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate())
}

/** 로컬 날짜의 자정(ms) */
export function localDayStart(date: string): number {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  return new Date(y, m - 1, d).getTime()
}

/** 날짜 문자열이 실제 있는 날인지(2026-02-30 거부) */
export function isRealDate(date: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!m) return false
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const t = new Date(Date.UTC(y, mo - 1, d))
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d
}

export const LOCAL_DATETIME_RE = /^(\d{4}-\d{2}-\d{2})[T ]([01]\d|2[0-3]):([0-5]\d)$/

/**
 * 로컬 벽시계 'YYYY-MM-DDTHH:mm' → ms. 없는 날짜면 null.
 * DST로 없는 시각(봄의 건너뛴 한 시간)은 앱 일정 입력 창과 같게 Date 규칙대로 앞으로 밀린다.
 */
export function parseLocalDateTime(s: string): number | null {
  const m = LOCAL_DATETIME_RE.exec(s)
  if (!m || !isRealDate(m[1]!)) return null
  const [y, mo, d] = m[1]!.split('-').map(Number) as [number, number, number]
  return new Date(y, mo - 1, d, Number(m[2]), Number(m[3])).getTime()
}

/* ───────── 출력 모양 ───────── */

export interface TodoView {
  id: string
  title: string
  done: boolean
  dueDate: string | null
  note: string
  categoryId: string
  categoryName: string
  /** 속한 스프린트(없으면 null) */
  sprintId: string | null
  completedAt: string | null
}

export const todoView = (t: TodoItem, categoryName: string): TodoView => ({
  id: t.id,
  title: t.title,
  done: t.done,
  dueDate: t.dueDate,
  note: t.note,
  categoryId: t.listId,
  categoryName,
  sprintId: t.sprintId,
  completedAt: t.completedAt === null ? null : localIso(t.completedAt),
})

export type EventView =
  | { id: string; title: string; allDay: true; startDate: string; endDate: string; note: string }
  | { id: string; title: string; allDay: false; start: string; end: string; note: string }

export const eventView = (e: CalendarEvent): EventView =>
  e.allDay
    ? {
        id: e.id,
        title: e.title,
        allDay: true,
        startDate: e.startDate,
        endDate: e.endDate,
        note: e.note,
      }
    : {
        id: e.id,
        title: e.title,
        allDay: false,
        start: localIso(e.startUtc),
        end: localIso(e.endUtc),
        note: e.note,
      }

/** 메모 제목 = 첫 줄(서식 기호 제외) */
export function memoTitle(body: string): string {
  const first = body.split('\n').find((l) => l.trim() !== '') ?? ''
  return first.replace(/^\s*(#{1,2}\s+|[-*]\s+(\[[ xX]\]\s+)?|\d+\.\s+)/, '').trim()
}

export const memoSummary = (m: Memo, previewChars = 120) => ({
  id: m.id,
  title: memoTitle(m.body),
  pinned: m.pinned,
  updatedAt: localIso(m.updatedAt),
  preview: m.body.length > previewChars ? `${m.body.slice(0, previewChars)}…` : m.body,
})

/* ───────── 할 일 거르기 ───────── */

export interface TodoFilter {
  status: 'open' | 'done' | 'all'
  /** 마감일 구간(포함). 하나라도 있으면 마감일 없는 항목은 빠진다. */
  dueFrom?: string | undefined
  dueTo?: string | undefined
  /** 제목/메모에 들어 있는 글자(대소문자 무시) */
  query?: string | undefined
}

export function filterTodos<T extends TodoItem>(items: readonly T[], f: TodoFilter): T[] {
  const q = f.query?.trim().toLowerCase()
  return items.filter((t) => {
    if (f.status === 'open' && t.done) return false
    if (f.status === 'done' && !t.done) return false
    if (f.dueFrom !== undefined || f.dueTo !== undefined) {
      if (t.dueDate === null) return false
      if (f.dueFrom !== undefined && t.dueDate < f.dueFrom) return false
      if (f.dueTo !== undefined && t.dueDate > f.dueTo) return false
    }
    if (q && !t.title.toLowerCase().includes(q) && !t.note.toLowerCase().includes(q)) return false
    return true
  })
}

export interface SprintView {
  id: string
  name: string
  goal: string
  startDate: string
  endDate: string
  status: 'upcoming' | 'active' | 'ended'
  /** 진행 중이면 끝 날까지 남은 날(오늘 제외), 아니면 null */
  daysLeft: number | null
  done: number
  total: number
}

/** 스프린트 요약: 상태(오늘 기준), 남은 날, 끝낸 할 일/전체 */
export function sprintView(
  s: Sprint,
  items: readonly Pick<TodoItem, 'sprintId' | 'done'>[],
  today: string,
): SprintView {
  const mine = items.filter((t) => t.sprintId === s.id)
  const status = today < s.startDate ? 'upcoming' : today > s.endDate ? 'ended' : 'active'
  const days = (a: string, b: string) =>
    Math.round((localDayStart(b) - localDayStart(a)) / 86_400_000)
  return {
    id: s.id,
    name: s.name,
    goal: s.goal,
    startDate: s.startDate,
    endDate: s.endDate,
    status,
    daysLeft: status === 'active' ? days(today, s.endDate) : null,
    done: mine.filter((t) => t.done).length,
    total: mine.length,
  }
}
