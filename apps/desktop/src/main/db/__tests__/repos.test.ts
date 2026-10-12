import {
  DEFAULT_POMODORO,
  type CalendarEvent,
  type Settings,
  type ThemeRule,
  type TimerState,
  type TodoItem,
  type TodoList,
} from '@kkumikkumi/schema'
import { beforeEach, describe, expect, it } from 'vitest'
import { openDb, type Db } from '../connection'
import { migrate } from '../migrate'
import { migrations } from '../migrations'
import { createRepos, NotFoundError, type Repos } from '../repos'

const U = (n: number) => `00000000-0000-7000-8000-${String(n).padStart(12, '0')}`

let db: Db
let repos: Repos
beforeEach(() => {
  db = openDb(':memory:')
  migrate(db, migrations)
  repos = createRepos(db)
})

const list = (n: number, order = n): TodoList => ({
  id: U(n),
  name: `목록${n}`,
  order,
  createdAt: n,
  updatedAt: n,
})
const item = (n: number, listId: string, o: Partial<TodoItem> = {}): TodoItem => ({
  id: U(100 + n),
  listId,
  title: `할 일 ${n}`,
  done: false,
  completedAt: null,
  dueDate: null,
  note: '',
  order: n,
  createdAt: n,
  updatedAt: n,
  ...o,
})

describe('TodoRepo', () => {
  it('목록 CRUD와 기본 목록', () => {
    expect(repos.todo.defaultList()).toBeNull()
    repos.todo.insertList(list(2))
    repos.todo.insertList(list(1))
    expect(repos.todo.lists().map((l) => l.id)).toEqual([U(1), U(2)])
    expect(repos.todo.defaultList()?.id).toBe(U(1))
    repos.todo.updateList({ ...list(1), name: '새 이름', order: 5 })
    expect(repos.todo.getList(U(1))?.name).toBe('새 이름')
    expect(repos.todo.defaultList()?.id).toBe(U(2))
  })

  it('항목 CRUD, 불리언 변환, 마감일 조회', () => {
    repos.todo.insertList(list(1))
    repos.todo.insertItem(item(1, U(1), { dueDate: '2026-10-12' }))
    repos.todo.insertItem(item(2, U(1)))
    repos.todo.updateItem(item(2, U(1), { done: true, completedAt: 50 }))
    const items = repos.todo.items(U(1))
    expect(items.map((i) => [i.title, i.done])).toEqual([
      ['할 일 1', false],
      ['할 일 2', true],
    ])
    expect(repos.todo.itemsDueBetween('2026-10-01', '2026-10-31').map((i) => i.id)).toEqual([
      U(101),
    ])
  })

  it('목록 삭제 시 항목도 삭제된다', () => {
    repos.todo.insertList(list(1))
    repos.todo.insertItem(item(1, U(1)))
    repos.todo.deleteList(U(1))
    expect(repos.todo.getItem(U(101))).toBeNull()
  })

  it('없는 목록에 항목을 넣으면 FK 오류', () => {
    expect(() => repos.todo.insertItem(item(1, U(9)))).toThrow()
  })

  it('잘못된 입력은 zod가 거부한다', () => {
    repos.todo.insertList(list(1))
    expect(() => repos.todo.insertItem(item(1, U(1), { title: '' }))).toThrow()
    expect(() => repos.todo.insertItem({ ...item(1, U(1)), extra: 1 } as TodoItem)).toThrow()
  })

  it('정렬: 전부 성공하거나 전부 취소', () => {
    repos.todo.insertList(list(1))
    repos.todo.insertItem(item(1, U(1)))
    repos.todo.insertItem(item(2, U(1)))
    repos.todo.reorderItems(U(1), [U(102), U(101)], 99)
    expect(repos.todo.items(U(1)).map((i) => i.id)).toEqual([U(102), U(101)])
    expect(() => repos.todo.reorderItems(U(1), [U(101), U(999)], 100)).toThrow(NotFoundError)
    expect(repos.todo.items(U(1)).map((i) => i.id)).toEqual([U(102), U(101)])
  })

  it('없는 항목 수정/삭제는 NotFoundError', () => {
    expect(() => repos.todo.deleteItem(U(1))).toThrow(NotFoundError)
  })
})

describe('CalendarRepo', () => {
  const base = {
    title: 'a',
    color: '#ff0000',
    note: '',
    recurrence: null,
    createdAt: 0,
    updatedAt: 0,
  } as const
  const timed = (n: number, startUtc: number, endUtc: number): CalendarEvent => ({
    ...base,
    id: U(n),
    allDay: false,
    startUtc,
    endUtc,
    tzid: 'Asia/Seoul',
  })
  const allDay = (n: number, startDate: string, endDate: string): CalendarEvent => ({
    ...base,
    id: U(n),
    allDay: true,
    startDate,
    endDate,
  })
  const range = { fromUtc: 100, toUtc: 200, fromDate: '2026-10-10', toDate: '2026-10-12' }

  it('시각/종일 일정을 왕복 저장한다', () => {
    repos.calendar.insert(timed(1, 10, 20))
    repos.calendar.insert(allDay(2, '2026-10-09', '2026-10-10'))
    expect(repos.calendar.get(U(1))).toEqual(timed(1, 10, 20))
    expect(repos.calendar.get(U(2))).toEqual(allDay(2, '2026-10-09', '2026-10-10'))
  })

  it('범위와 겹치는 일정만 조회한다', () => {
    repos.calendar.insert(timed(1, 50, 100)) // 끝 = 시작 경계 → 제외
    repos.calendar.insert(timed(2, 150, 250)) // 걸침
    repos.calendar.insert(timed(3, 200, 300)) // 시작 = 범위 끝 → 제외
    repos.calendar.insert(timed(4, 120, 120)) // 길이 0, 범위 안
    repos.calendar.insert(allDay(5, '2026-10-01', '2026-10-10')) // 마지막 날 겹침
    repos.calendar.insert(allDay(6, '2026-10-13', '2026-10-14')) // 제외
    expect(
      repos.calendar
        .inRange(range)
        .map((e) => e.id)
        .sort(),
    ).toEqual([U(2), U(4), U(5)])
  })

  it('시각 일정을 종일 일정으로 바꿀 수 있다', () => {
    repos.calendar.insert(timed(1, 10, 20))
    repos.calendar.update(allDay(1, '2026-10-10', '2026-10-10'))
    expect(repos.calendar.get(U(1))?.allDay).toBe(true)
  })

  it('종료 < 시작은 거부', () => {
    expect(() => repos.calendar.insert(timed(1, 20, 10))).toThrow()
  })

  it('DB CHECK 제약: 종일 일정에 시각 값이 섞이면 거부', () => {
    expect(() =>
      db
        .prepare(
          `INSERT INTO calendar_events (id, title, color, note, all_day, start_utc, end_utc, tzid, start_date, end_date, created_at, updated_at)
           VALUES ('x', 'a', '#000000', '', 1, 1, 2, 'UTC', '2026-01-01', '2026-01-01', 0, 0)`,
        )
        .run(),
    ).toThrow()
  })
})

describe('TimerRepo', () => {
  const s: TimerState = {
    status: 'running',
    mode: 'focus',
    durationMs: 60000,
    endsAt: 1000,
    pausedRemainingMs: null,
    pomodoro: null,
    updatedAt: 1,
  }
  it('없으면 null, 저장 후 덮어쓰기', () => {
    expect(repos.timer.get()).toBeNull()
    repos.timer.save(s)
    repos.timer.save({ ...s, status: 'paused', endsAt: null, pausedRemainingMs: 500 })
    expect(repos.timer.get()?.status).toBe('paused')
    expect(Number(db.prepare('SELECT count(*) AS n FROM timer_state').get()?.['n'])).toBe(1)
  })
  it('running인데 endsAt 없으면 거부', () => {
    expect(() => repos.timer.save({ ...s, endsAt: null })).toThrow()
  })
  it('뽀모도로 단계 왕복', () => {
    repos.timer.save({ ...s, mode: 'break', pomodoro: { phase: 'longBreak', round: 4 } })
    expect(repos.timer.get()?.pomodoro).toEqual({ phase: 'longBreak', round: 4 })
  })
})

describe('TimerSessionRepo / 뽀모도로 설정', () => {
  const sess = (n: number, endedAt: number) => ({
    id: U(300 + n),
    kind: 'focus' as const,
    pomodoro: n % 2 === 0,
    startedAt: endedAt - 60000,
    endedAt,
    plannedMs: 60000,
    actualMs: 60000,
    completed: true,
  })
  it('끝난 시각 구간 [from, to), 최근 순', () => {
    const K = 1_000_000
    repos.timerSessions.insert(sess(1, K))
    repos.timerSessions.insert(sess(2, 2 * K))
    repos.timerSessions.insert(sess(3, 3 * K))
    expect(repos.timerSessions.endedBetween(K, 3 * K).map((x) => x.endedAt)).toEqual([2 * K, K])
    expect(repos.timerSessions.endedBetween(0, 10 * K)[0]).toEqual(sess(3, 3 * K))
  })
  it('설정: 없으면 기본값, 손상돼도 기본값, 저장 후 읽기', () => {
    expect(repos.settings.pomodoro()).toEqual(DEFAULT_POMODORO)
    db.prepare("INSERT INTO settings (key, value) VALUES ('pomodoro', '{oops')").run()
    expect(repos.settings.pomodoro()).toEqual(DEFAULT_POMODORO)
    repos.settings.savePomodoro({ ...DEFAULT_POMODORO, focusMin: 50 })
    expect(repos.settings.pomodoro().focusMin).toBe(50)
    expect(() => repos.settings.savePomodoro({ ...DEFAULT_POMODORO, focusMin: 0 })).toThrow()
  })
})

describe('ThemeRuleRepo', () => {
  const rule = (n: number, priority: number, themeId = U(50)): ThemeRule => ({
    id: U(n),
    themeId,
    enabled: true,
    priority,
    conditions: {
      timeRange: { start: '22:00', end: '06:00' },
      weekdays: [1, 2],
      mode: 'any',
      appearance: 'dark',
    },
    createdAt: n,
    updatedAt: n,
  })
  it('CRUD와 priority 정렬, 조건 JSON 왕복', () => {
    repos.themeRules.insert(rule(1, 1))
    repos.themeRules.insert(rule(2, 5))
    expect(repos.themeRules.list().map((r) => r.id)).toEqual([U(2), U(1)])
    expect(repos.themeRules.list()[0]?.conditions).toEqual(rule(2, 5).conditions)
    repos.themeRules.update({ ...rule(1, 9), enabled: false })
    expect(repos.themeRules.list()[0]).toMatchObject({ id: U(1), enabled: false })
  })
  it('테마 삭제 시 규칙 일괄 삭제', () => {
    repos.themeRules.insert(rule(1, 1, U(60)))
    repos.themeRules.insert(rule(2, 1, U(61)))
    expect(repos.themeRules.deleteByTheme(U(60))).toBe(1)
    expect(repos.themeRules.list().map((r) => r.id)).toEqual([U(2)])
  })
})

describe('SettingsRepo', () => {
  const s: Settings = {
    schemaVersion: 1,
    activeThemeId: U(1),
    petEnabled: false,
    autoSwitchEnabled: true,
    manualOverride: null,
  }
  it('없으면 null, 저장/덮어쓰기', () => {
    expect(repos.settings.get()).toBeNull()
    repos.settings.save(s)
    repos.settings.save({ ...s, petEnabled: true })
    expect(repos.settings.get()).toEqual({ ...s, petEnabled: true })
  })
  it('저장된 JSON이 손상되면 읽기에서 오류', () => {
    db.prepare("INSERT INTO settings (key, value) VALUES ('app', '{\"schemaVersion\":1}')").run()
    expect(() => repos.settings.get()).toThrow()
  })
})
