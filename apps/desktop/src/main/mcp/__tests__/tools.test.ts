import type { McpMode } from '@kkumikkumi/schema'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DataDomain } from '../../../shared/api'
import { makeEnv, type TestEnv } from '../../__tests__/helpers'
import { createHandlers } from '../../ipc/handlers'
import { TimerService } from '../../timer/timerService'
import { createMcpServer } from '../tools'

let env: TestEnv
let mode: McpMode
let changed: DataDomain[]

beforeEach(async () => {
  env = await makeEnv()
  changed = []
})
afterEach(async () => {
  vi.restoreAllMocks()
  await env.cleanup()
})

async function connect(registered: Exclude<McpMode, 'off'>) {
  mode = registered
  const handlers = createHandlers({
    ...env.core,
    now: () => env.clock.now,
    newId: env.newId,
    pickImageFile: async () => null,
    timer: new TimerService({
      load: () => env.core.repos.timer.get(),
      save: (s) => env.core.repos.timer.save(s),
      now: () => env.clock.now,
      setTimer: () => null,
      clearTimer: () => {},
      onChange: () => {},
      onComplete: () => {},
      pomodoro: () => env.core.repos.settings.pomodoro(),
      onSession: (s) => env.core.repos.timerSessions.insert({ ...s, id: env.newId() }),
    }),
  })
  const server = createMcpServer({
    handlers,
    mode: registered,
    currentMode: () => mode,
    now: () => env.clock.now,
    changed: (d) => changed.push(d),
    version: '0.0.0-test',
  })
  const [a, b] = InMemoryTransport.createLinkedPair()
  const client = new Client({ name: 'test', version: '0' })
  await Promise.all([server.connect(a), client.connect(b)])
  /** 도구 호출 → { error, data } */
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const r = (await client.callTool({ name, arguments: args })) as {
      isError?: boolean
      content: { type: string; text: string }[]
    }
    const text = r.content[0]!.text
    return r.isError ? { error: text, data: null } : { error: null, data: JSON.parse(text) }
  }
  return { client, call }
}

describe('MCP 도구', () => {
  it('읽기만이면 쓰기 도구를 내놓지 않는다', async () => {
    const { client } = await connect('read')
    const names = (await client.listTools()).tools.map((t) => t.name)
    expect(names).toContain('list_todos')
    expect(names).not.toContain('add_todo')
    expect(names).not.toContain('delete_event')
    expect(names).not.toContain('set_timetable')
  })

  it('쓰기 도구는 지우기에 destructiveHint를 단다', async () => {
    const { client } = await connect('readwrite')
    const tools = (await client.listTools()).tools
    const hint = (n: string) => tools.find((t) => t.name === n)?.annotations
    expect(hint('delete_todo')?.destructiveHint).toBe(true)
    expect(hint('add_todo')?.destructiveHint).toBe(false)
    expect(hint('list_todos')?.readOnlyHint).toBe(true)
    expect(hint('set_timetable')?.destructiveHint).toBe(true)
  })

  it('할 일 추가 → 찾기 → 완료, 바뀐 영역을 알린다', async () => {
    const { call } = await connect('readwrite')
    const added = await call('add_todo', { title: '우유 사기', dueDate: '2026-10-20', note: '2개' })
    expect(added.error).toBeNull()
    expect(added.data).toMatchObject({ title: '우유 사기', note: '2개', categoryName: '할 일' })
    expect(changed).toEqual(['todo'])

    const found = await call('list_todos', { dueFrom: '2026-10-20', dueTo: '2026-10-20' })
    expect(found.data.items.map((t: { id: string }) => t.id)).toEqual([added.data.id])

    const done = await call('update_todo', { id: added.data.id, done: true })
    expect(done.data.done).toBe(true)
    expect((await call('list_todos')).data.total).toBe(0)
  })

  it('없는 날짜나 없는 항목은 오류 코드로', async () => {
    const { call } = await connect('readwrite')
    expect((await call('add_todo', { title: 'x', dueDate: '2026-02-30' })).error).toMatch(
      /invalid/i,
    )
    const r = await call('update_todo', { id: '00000000-0000-7000-8000-999999999999', done: true })
    expect(r.error).toMatch(/^error: not_found/)
    expect(changed).toEqual([])
  })

  it('연결 뒤에 읽기만으로 바뀌면 쓰기를 거부한다', async () => {
    const { call } = await connect('readwrite')
    mode = 'read'
    const r = await call('add_todo', { title: '몰래 추가' })
    expect(r.error).toMatch(/^error: read_only/)
    expect((await call('set_timetable', { name: '학교', entries: [] })).error).toMatch(
      /^error: read_only/,
    )
    expect(changed).toEqual([])
    mode = 'readwrite'
    expect((await call('list_todos')).data.total).toBe(0)
  })

  it('시각 일정과 종일 일정을 로컬 시각으로 주고받는다', async () => {
    const { call } = await connect('readwrite')
    const timed = await call('add_event', {
      title: '치과',
      allDay: false,
      start: '2026-10-18T15:00',
      end: '2026-10-18T16:00',
    })
    expect(timed.error).toBeNull()
    expect(timed.data.start).toMatch(/^2026-10-18T15:00/)
    const allDay = await call('add_event', {
      title: '여행',
      allDay: true,
      start: '2026-10-18',
      end: '2026-10-19',
    })
    expect(allDay.data).toMatchObject({ allDay: true, startDate: '2026-10-18' })
    expect(changed).toEqual(['calendar', 'calendar'])

    const list = await call('list_events', { from: '2026-10-18', to: '2026-10-18' })
    expect(list.data.map((e: { title: string }) => e.title).sort()).toEqual(['여행', '치과'])

    // 시각은 셋을 함께 바꿔야 한다
    expect(
      (await call('update_event', { id: timed.data.id, start: '2026-10-18T17:00' })).error,
    ).toMatch(/^error: invalid_input/)
    const moved = await call('update_event', {
      id: timed.data.id,
      title: '치과 검진',
      allDay: false,
      start: '2026-10-19T09:00',
      end: '2026-10-19T09:30',
    })
    expect(moved.data).toMatchObject({ title: '치과 검진' })
    expect(moved.data.start).toMatch(/^2026-10-19T09:00/)

    // 끝이 시작보다 빠르면 앱 스키마가 거부한다
    const bad = await call('add_event', {
      title: 'x',
      allDay: false,
      start: '2026-10-18T15:00',
      end: '2026-10-18T14:00',
    })
    expect(bad.error).toMatch(/^error: invalid_input/)
  })

  it('일정 구간은 366일까지', async () => {
    const { call } = await connect('read')
    expect((await call('list_events', { from: '2026-01-01', to: '2027-01-01' })).error).toBeNull()
    expect((await call('list_events', { from: '2026-01-01', to: '2027-01-02' })).error).toMatch(
      /invalid_input/,
    )
  })

  it('메모 만들기/읽기/검색/수정/지우기', async () => {
    const { call } = await connect('readwrite')
    const m = await call('create_memo', { body: '# 장보기\n- [ ] 우유' })
    expect(m.data.title).toBe('장보기')
    expect((await call('get_memo', { id: m.data.id })).data.body).toBe('# 장보기\n- [ ] 우유')
    expect((await call('list_memos', { query: '우유' })).data.total).toBe(1)
    expect((await call('list_memos', { query: '없는 말' })).data.total).toBe(0)
    await call('update_memo', { id: m.data.id, pinned: true })
    expect((await call('list_memos')).data.memos[0].pinned).toBe(true)
    await call('delete_memo', { id: m.data.id })
    expect((await call('get_memo', { id: m.data.id })).error).toMatch(/not_found/)
    expect(changed).toEqual(['memos', 'memos', 'memos'])
  })

  it('타이머 시작과 한눈에 보기', async () => {
    const { call } = await connect('readwrite')
    const t = await call('control_timer', { action: 'start', minutes: 10, mode: 'focus' })
    expect(t.data).toMatchObject({ status: 'running', remainingSeconds: 600 })
    expect((await call('control_timer', { action: 'pause' })).data.status).toBe('paused')
    const o = await call('get_overview')
    expect(o.data.timer.status).toBe('paused')
    expect(o.data.today).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('시간표는 고른 시간표를 보여 준다', async () => {
    const { call } = await connect('read')
    const r = await call('get_timetable')
    expect(r.error).toBeNull()
    expect(r.data.selected.mode).toBe('period')
  })
})

describe('MCP set_timetable', () => {
  const entry = { slot: { kind: 'period', day: 0, period: 1 }, subject: '국어' }
  const periods = [
    { start: '08:40', end: '09:30' },
    { start: '09:40', end: '10:30' },
  ]

  it('교시 시간표를 만들고 선택하며 get_timetable과 같은 모양으로 돌려준다', async () => {
    const { call } = await connect('readwrite')
    const r = await call('set_timetable', {
      name: '학교',
      settings: { periods },
      entries: [
        entry,
        {
          slot: { kind: 'period', day: 4, period: 2 },
          subject: '수학',
          room: '교실',
          tone: 2,
        },
      ],
    })
    expect(r.error).toBeNull()
    expect(r.data.selected).toMatchObject({ name: '학교', mode: 'period', periods })
    expect(r.data.selected.entries).toHaveLength(2)
    expect(r.data.selected.entries[0]).toMatchObject({ ...entry, room: '', tone: null })
    expect(r.data.selected.entries[1]).toMatchObject({ subject: '수학', room: '교실', tone: 2 })
    expect((await call('get_timetable')).data).toEqual(r.data)
    expect(changed).toEqual(['timetable'])
  })

  it('지정한 시간표만 교체하고 이름과 설정은 생략하면 유지한다; 빈 배열은 전체 삭제', async () => {
    const { call } = await connect('readwrite')
    const a = (
      await call('set_timetable', { name: '학교', settings: { periods }, entries: [entry] })
    ).data.selected
    const other = (await call('set_timetable', { name: '다른 시간표', entries: [entry] })).data
      .selected
    const replacement = { ...entry, subject: '영어' }
    const r = await call('set_timetable', { timetableId: a.id, entries: [replacement] })
    expect(r.error).toBeNull()
    expect(r.data.selected).toMatchObject({ id: a.id, name: a.name, periods })
    expect(r.data.selected.entries).toHaveLength(1)
    expect(r.data.selected.entries[0].subject).toBe('영어')
    expect((await call('get_timetable', { timetableId: other.id })).data.selected).toEqual(other)
    expect(
      (await call('set_timetable', { timetableId: a.id, entries: [] })).data.selected.entries,
    ).toEqual([])
    expect((await call('get_timetable', { timetableId: other.id })).data.selected).toEqual(other)
  })

  it('시간 방식으로 바꾸면 기존 교시 칸을 지우고 시간 항목을 저장한다', async () => {
    const { call } = await connect('readwrite')
    const a = (await call('set_timetable', { name: '학교', entries: [entry] })).data.selected
    const timed = { slot: { kind: 'time', day: 5, start: '19:00', end: '20:40' }, subject: '자습' }
    const r = await call('set_timetable', {
      timetableId: a.id,
      name: '주말',
      settings: { mode: 'time', showSat: true },
      entries: [timed],
    })
    expect(r.error).toBeNull()
    expect(r.data.selected).toMatchObject({ id: a.id, name: '주말', mode: 'time', showSat: true })
    expect(r.data.selected.entries).toEqual([expect.objectContaining(timed)])
    expect(env.core.repos.timetable.listOf(a.id)).toHaveLength(1)
  })

  it.each([
    { entries: [entry, entry] },
    { entries: [{ ...entry, slot: { kind: 'period', day: 0, period: 3 } }] },
    { entries: [{ ...entry, slot: { kind: 'period', day: 7, period: 1 } }] },
    { entries: [{ ...entry, subject: ' ' }] },
    { entries: [{ ...entry, tone: 99 }] },
    { entries: [{ ...entry, slot: { kind: 'time', day: 0, start: '09:00', end: '10:00' } }] },
    {
      settings: { mode: 'time' },
      entries: [{ ...entry, slot: { kind: 'time', day: 0, start: '10:00', end: '09:00' } }],
    },
    {
      settings: {
        periods: [
          { start: '09:00', end: '10:00' },
          { start: '09:30', end: '10:30' },
        ],
      },
      entries: [],
    },
    { entries: Array.from({ length: 501 }, () => entry) },
  ])('잘못된 전체 교체는 설정·기존 칸·선택을 그대로 보존한다: %#', async (input) => {
    const { call } = await connect('readwrite')
    const a = (
      await call('set_timetable', { name: '학교', settings: { periods }, entries: [entry] })
    ).data.selected
    await call('set_timetable', { name: '선택된 시간표', entries: [] })
    const before = (await call('get_timetable')).data
    changed.length = 0
    const r = await call('set_timetable', { timetableId: a.id, name: '바뀐 이름', ...input })
    expect(r.error).toMatch(/invalid|conflict/i)
    expect((await call('get_timetable')).data).toEqual(before)
    expect((await call('get_timetable', { timetableId: a.id })).data.selected).toEqual(a)
    expect(changed).toEqual([])
  })

  it('새 시간표에는 이름이 필요하며 없는 ID를 보내면 새로 만들지 않는다', async () => {
    const { call } = await connect('readwrite')
    const before = (await call('get_timetable')).data
    expect((await call('set_timetable', { entries: [] })).error).toMatch(/invalid_input/)
    expect(
      (await call('set_timetable', { timetableId: env.newId(), name: '학교', entries: [] })).error,
    ).toMatch(/not_found/)
    expect((await call('get_timetable')).data).toEqual(before)
    expect(changed).toEqual([])
  })

  it('저장 도중 실패하면 삭제한 기존 칸과 이름·설정·선택을 모두 롤백한다', async () => {
    const { call } = await connect('readwrite')
    const a = (await call('set_timetable', { name: '학교', entries: [entry] })).data.selected
    await call('set_timetable', { name: '선택된 시간표', entries: [] })
    const before = (await call('get_timetable')).data
    const repo = env.core.repos.timetable
    const insert = repo.insert.bind(repo)
    vi.spyOn(repo, 'insert')
      .mockImplementationOnce(insert)
      .mockImplementationOnce(() => {
        throw new Error('disk')
      })
    changed.length = 0
    const r = await call('set_timetable', {
      timetableId: a.id,
      name: '수정',
      settings: { showSat: true },
      entries: [entry, { ...entry, slot: { kind: 'period', day: 1, period: 1 } }],
    })
    expect(r.error).toMatch(/internal/)
    expect((await call('get_timetable')).data).toEqual(before)
    expect((await call('get_timetable', { timetableId: a.id })).data.selected).toEqual(a)
    expect(changed).toEqual([])
  })

  it('시간표 개수 제한에 도달하면 생성은 거부하고 기존 시간표 교체는 허용한다', async () => {
    const { call } = await connect('readwrite')
    const original = (await call('get_timetable')).data.selected
    for (let i = env.core.repos.timetable.countTimetables(); i < 20; i++)
      expect((await call('set_timetable', { name: `시간표 ${i}`, entries: [] })).error).toBeNull()
    const before = (await call('get_timetable')).data
    changed.length = 0
    expect((await call('set_timetable', { name: '초과', entries: [] })).error).toMatch(/conflict/)
    expect((await call('get_timetable')).data).toEqual(before)
    expect(changed).toEqual([])
    expect(
      (await call('set_timetable', { timetableId: original.id, entries: [entry] })).error,
    ).toBeNull()
    expect(env.core.repos.timetable.countTimetables()).toBe(20)
  })
})

describe('MCP 스프린트', () => {
  it('만들기 → 할 일 넣기 → 목록(진행률·남은 날) → 지우면 할 일은 남는다', async () => {
    env.clock.now = new Date(2026, 9, 21, 9).getTime()
    const { call } = await connect('readwrite')
    const s = await call('create_sprint', {
      name: '중간고사 대비',
      startDate: '2026-10-20',
      endDate: '2026-11-02',
      goal: '수학 오답',
    })
    expect(s.error).toBeNull()
    expect(s.data).toMatchObject({ status: 'active', daysLeft: 12, done: 0, total: 0 })
    const a = await call('add_todo', { title: '오답 노트', sprintId: s.data.id })
    await call('add_todo', { title: '단어 100개', sprintId: s.data.id })
    await call('update_todo', { id: a.data.id, done: true })
    const list = await call('list_sprints')
    expect(list.data[0]).toMatchObject({ done: 1, total: 2 })
    const inSprint = await call('list_todos', { sprintId: s.data.id, status: 'all' })
    expect(inSprint.data.total).toBe(2)
    expect(
      (await call('create_sprint', { name: 'x', startDate: '2026-11-02', endDate: '2026-10-01' }))
        .error,
    ).toBeTruthy()
    await call('delete_sprint', { id: s.data.id })
    const after = await call('list_todos', { status: 'all' })
    expect(after.data.items.filter((t: { sprintId: string | null }) => t.sprintId)).toEqual([])
    expect(after.data.total).toBe(2)
    expect(changed).toContain('todo')
  })
  it('읽기만이면 스프린트 쓰기 도구가 없다', async () => {
    const { client } = await connect('read')
    const names = (await client.listTools()).tools.map((t) => t.name)
    expect(names).toContain('list_sprints')
    expect(names).not.toContain('create_sprint')
  })
})
