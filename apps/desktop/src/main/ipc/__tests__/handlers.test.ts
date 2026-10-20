import { stat } from 'node:fs/promises'
import { BUILTIN_THEME_IDS, presetLook, type Theme } from '@kkumikkumi/schema'
import sharp from 'sharp'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ZodError } from 'zod'
import { makeEnv, type TestEnv } from '../../__tests__/helpers'
import { toErrorCode } from '../errors'
import { TimerService } from '../../timer/timerService'
import { createHandlers, type Handlers } from '../handlers'

let env: TestEnv
let h: Handlers
let picked: Uint8Array | null
let miniCalls: string[]

beforeEach(async () => {
  env = await makeEnv()
  picked = null
  miniCalls = []
  h = createHandlers({
    ...env.core,
    now: () => env.clock.now,
    newId: env.newId,
    pickImageFile: async () => picked,
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
    miniTimer: {
      open: () => miniCalls.push('open'),
      close: () => miniCalls.push('close'),
      apply: (p) => miniCalls.push(`apply:${p.alwaysOnTop}`),
    },
  })
})
afterEach(async () => {
  await env.cleanup()
})

/** 핸들러 호출 결과를 register.ts와 같은 방식으로 코드로 바꾼다 */
const codeOf = async (p: Promise<unknown>) => {
  try {
    await p
    return 'ok'
  } catch (e) {
    return toErrorCode(e)
  }
}
const activeId = () => env.core.repos.settings.get()!.activeThemeId
const pngBytes = () =>
  sharp({
    create: { width: 8, height: 8, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0.5 } },
  })
    .png()
    .toBuffer()
    .then((b) => new Uint8Array(b))
const anyRule = (themeId: string) => ({
  themeId,
  enabled: true,
  priority: 1,
  conditions: { timeRange: null, weekdays: [], mode: 'any', appearance: 'any' },
})

describe('입력 재검증', () => {
  it('타입이 틀리거나 미지의 키가 있으면 invalid_input', async () => {
    expect(await codeOf(h['themes.get']({ id: 123 }))).toBe('invalid_input')
    expect(await codeOf(h['themes.get']({ id: activeId(), extra: 1 }))).toBe('invalid_input')
    expect(await codeOf(h['themes.get']({ id: '../../etc/passwd' }))).toBe('invalid_input')
    expect(await codeOf(h['themes.list']({}))).toBe('invalid_input')
    expect(await codeOf(h['todo.items.create']({ listId: null, title: '' }))).toBe('invalid_input')
    expect(await codeOf(h['settings.update']({ patch: { schemaVersion: 2 } }))).toBe(
      'invalid_input',
    )
  })

  it('toErrorCode는 알 수 없는 오류를 internal로 숨긴다', () => {
    expect(toErrorCode(new Error('할 일 제목 같은 사용자 데이터'))).toBe('internal')
    expect(toErrorCode(new ZodError([]))).toBe('invalid_input')
  })
})

describe('themes', () => {
  it('save는 updatedAt을 main 시각으로 덮어쓴다', async () => {
    const t = await h['themes.get']({ id: activeId() })
    env.clock.now += 1000
    const saved = await h['themes.save']({ theme: { ...t, updatedAt: 1 } })
    expect(saved).toMatchObject({ name: t.name, updatedAt: env.clock.now })
    // 기본 테마는 save로도 이름을 바꿀 수 없다
    expect(await codeOf(h['themes.save']({ theme: { ...t, name: '바뀜' } }))).toBe('builtin_theme')
  })

  it('save: 스키마 위반(겹침)은 거부', async () => {
    const t = await h['themes.get']({ id: activeId() })
    const bad: Theme = { ...t, blocks: t.blocks.map((b) => ({ ...b, col: 0, row: 0 })) }
    expect(await codeOf(h['themes.save']({ theme: bad }))).toBe('invalid_input')
  })

  const look = (name: string) => ({
    ...presetLook('cottonCandy'),
    name,
    template: 'photoCalendar' as const,
  })

  it('create: 색·배경·글꼴·템플릿으로 만들고 목록에 나온다, 잘못된 값은 거부', async () => {
    const t = await h['themes.create'](look('솜사탕'))
    expect(t.defaults.palette.accent).toBe('#f4c2df')
    expect(t.blocks.map((b) => b.type)).toEqual(['image', 'calendar'])
    const list = await h['themes.list'](undefined)
    expect(list.find((s) => s.id === t.id)).toMatchObject({
      ok: true,
      builtin: false,
      bgColor: '#daecf6',
    })
    const bad = [
      { ...look('x'), template: 'pretzel' },
      { ...look('x'), fontId: 'Bad Font' },
      { ...look('x'), background: { color: 'red', pattern: null } },
      { ...look('x'), palette: { ...look('x').palette, accent: 'url(x)' } },
      { ...look('x'), css: 'a{}' },
      { ...look(' ') },
    ]
    for (const b of bad) expect(await codeOf(h['themes.create'](b as never))).toBe('invalid_input')
  })

  it('첫 실행 활성 테마는 기본 테마(푸딩 아침), 기본 테마는 지우거나 이름을 바꿀 수 없다', async () => {
    expect(activeId()).toBe(BUILTIN_THEME_IDS.pudding)
    const list = await h['themes.list'](undefined)
    expect(list.map((s) => s.ok && [s.name, s.builtin])).toEqual([
      ['푸딩 아침', true],
      ['코튼캔디', true],
    ])
    expect(await codeOf(h['themes.delete']({ id: activeId() }))).toBe('builtin_theme')
    expect(await codeOf(h['themes.rename']({ id: activeId(), name: 'x' }))).toBe('builtin_theme')
  })

  it('resetBuiltin: 기본 테마를 처음 상태로, 내 테마는 not_found', async () => {
    const id = BUILTIN_THEME_IDS.cottonCandy
    const t = await h['themes.get']({ id })
    await h['themes.save']({ theme: { ...t, blocks: [] } })
    const r = await h['themes.resetBuiltin']({ id })
    expect(r.blocks).toHaveLength(3)
    const mine = await h['themes.create'](look('a'))
    expect(await codeOf(h['themes.resetBuiltin']({ id: mine.id }))).toBe('not_found')
    expect(await codeOf(h['themes.resetBuiltin']({ id: '../x' }))).toBe('invalid_input')
  })

  it('delete: 활성 테마를 지우면 첫 테마로 전환하고 규칙/오버라이드 정리', async () => {
    const mine = await h['themes.create'](look('내 테마'))
    await h['settings.update']({ patch: { activeThemeId: mine.id } })
    await h['themeRules.create']({ rule: anyRule(mine.id) })
    await h['settings.update']({ patch: { manualOverride: { themeId: mine.id, until: null } } })
    const s = await h['themes.delete']({ id: mine.id })
    expect(s).toMatchObject({ activeThemeId: BUILTIN_THEME_IDS.pudding, manualOverride: null })
    expect(await h['themeRules.list'](undefined)).toEqual([])
  })
})

describe('assets', () => {
  it('importBytes → 파일 저장 → 테마에서 참조해 저장 가능', async () => {
    const id = activeId()
    const { asset, hasTransparency } = await h['assets.importBytes']({
      themeId: id,
      purpose: 'pet',
      bytes: await pngBytes(),
    })
    expect(hasTransparency).toBe(true)
    expect((await stat(env.core.themes.assetPath(id, asset))).isFile()).toBe(true)
    const t = await h['themes.get']({ id })
    const saved = await h['themes.save']({
      theme: {
        ...t,
        assets: [asset],
        pet: {
          ...t.pet,
          source: { type: 'custom', images: { rest: asset.hash, music: null, typing: null } },
        },
      },
    })
    expect(saved.assets).toEqual([asset])
  })

  it('importBytes: SVG 거부, 없는 테마 거부, Uint8Array가 아니면 거부', async () => {
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>')
    expect(
      await codeOf(h['assets.importBytes']({ themeId: activeId(), purpose: 'image', bytes: svg })),
    ).toBe('unsupported_format')
    expect(
      await codeOf(
        h['assets.importBytes']({
          themeId: env.newId(),
          purpose: 'image',
          bytes: await pngBytes(),
        }),
      ),
    ).toBe('not_found')
    expect(
      await codeOf(
        h['assets.importBytes']({ themeId: activeId(), purpose: 'image', bytes: [1, 2, 3] }),
      ),
    ).toBe('invalid_input')
  })

  it('흰 배경 판별 + removeWhiteBackground: 새 투명 PNG 에셋, 원본은 그대로', async () => {
    const id = activeId()
    const w = 48
    const raw = new Uint8Array(w * w * 4).fill(255)
    for (let y = 12; y < 36; y++)
      for (let x = 12; x < 36; x++) raw.set([40, 90, 200, 255], (y * w + x) * 4)
    const jpg = await sharp(raw, { raw: { width: w, height: w, channels: 4 } })
      .jpeg()
      .toBuffer()
    const imported = await h['assets.importBytes']({ themeId: id, purpose: 'image', bytes: jpg })
    expect(imported).toMatchObject({ hasTransparency: false, whiteBackground: true })
    const cut = await h['assets.removeWhiteBackground']({
      themeId: id,
      hash: imported.asset.hash,
      strength: 40,
    })
    // 흰 여백을 지우고 사각형 크기로 잘린다(남은 것은 불투명한 사각형뿐)
    expect(cut.asset.mime).toBe('image/png')
    expect(cut.asset.width).toBeLessThan(w)
    expect(cut.asset.width).toBeGreaterThanOrEqual(24)
    expect((await stat(env.core.themes.assetPath(id, imported.asset))).isFile()).toBe(true)
    // 잘못된 입력
    expect(
      await codeOf(
        h['assets.removeWhiteBackground']({
          themeId: id,
          hash: imported.asset.hash,
          strength: 101,
        }),
      ),
    ).toBe('invalid_input')
    expect(
      await codeOf(h['assets.removeWhiteBackground']({ themeId: id, hash: '../x', strength: 40 })),
    ).toBe('invalid_input')
    expect(
      await codeOf(
        h['assets.removeWhiteBackground']({ themeId: id, hash: 'a'.repeat(64), strength: 40 }),
      ),
    ).toBe('not_found')
  })

  it('importFromDialog: 취소하면 null', async () => {
    expect(await h['assets.importFromDialog']({ themeId: activeId(), purpose: 'image' })).toBeNull()
    picked = await pngBytes()
    expect(
      await h['assets.importFromDialog']({ themeId: activeId(), purpose: 'image' }),
    ).toMatchObject({
      asset: { mime: 'image/png' },
    })
  })
})

describe('settings', () => {
  it('없는 테마로 전환은 거부', async () => {
    expect(await codeOf(h['settings.update']({ patch: { activeThemeId: env.newId() } }))).toBe(
      'not_found',
    )
  })
  it('부분 업데이트', async () => {
    const s = await h['settings.update']({ patch: { petEnabled: true } })
    expect(s).toMatchObject({ petEnabled: true, activeThemeId: activeId() })
  })
})

describe('todo', () => {
  it('listId null → 기본 목록, 완료/해제 시 completedAt', async () => {
    const a = await h['todo.items.create']({ listId: null, title: '물 마시기' })
    const b = await h['todo.items.create']({ listId: null, title: '산책', dueDate: '2026-10-12' })
    expect([a.order, b.order]).toEqual([0, 1])
    env.clock.now += 5
    const done = await h['todo.items.update']({ id: a.id, patch: { done: true } })
    expect(done.completedAt).toBe(env.clock.now)
    const undone = await h['todo.items.update']({ id: a.id, patch: { done: false } })
    expect(undone.completedAt).toBeNull()
    const { list, items } = await h['todo.items.list']({ listId: null })
    expect(list.name).toBe('할 일')
    expect(items.map((i) => i.title)).toEqual(['물 마시기', '산책'])
    const due = await h['todo.items.dueBetween']({ fromDate: '2026-10-01', toDate: '2026-10-31' })
    expect(due.map((i) => i.id)).toEqual([b.id])
  })

  it('없는 목록으로 옮기면 not_found(내부 오류 아님)', async () => {
    const a = await h['todo.items.create']({ listId: null, title: 'a' })
    const missing = '00000000-0000-4000-8000-0000000000ff'
    expect(await codeOf(h['todo.items.update']({ id: a.id, patch: { listId: missing } }))).toBe(
      'not_found',
    )
  })

  it('reorder: 중복 id 거부', async () => {
    const a = await h['todo.items.create']({ listId: null, title: 'a' })
    expect(await codeOf(h['todo.items.reorder']({ listId: a.listId, ids: [a.id, a.id] }))).toBe(
      'invalid_input',
    )
  })
})

describe('calendar', () => {
  it('create: renderer가 보낸 id/createdAt은 무시한다', async () => {
    const fakeId = '00000000-0000-7000-8000-999999999999'
    const e = await h['calendar.create']({
      event: {
        id: fakeId,
        createdAt: 1,
        title: '회의',
        color: '#ff0000',
        note: '',
        allDay: false,
        startUtc: 10,
        endUtc: 20,
        tzid: 'Asia/Seoul',
      },
    })
    expect(e.id).not.toBe(fakeId)
    expect(e.createdAt).toBe(env.clock.now)
  })

  it('create: 미지의 키(html) 거부', async () => {
    const event = {
      title: 'a',
      color: '#ff0000',
      note: '',
      allDay: true,
      startDate: '2026-10-12',
      endDate: '2026-10-12',
      html: '<b>',
    }
    expect(await codeOf(h['calendar.create']({ event }))).toBe('invalid_input')
  })
})

describe('calendar: 디데이용 조회', () => {
  const allDay = (title: string, startDate: string, endDate = startDate) => ({
    title,
    color: '#ff0000',
    note: '',
    allDay: true as const,
    startDate,
    endDate,
  })
  it('get: 있으면 일정, 없으면 null, 잘못된 ID는 거부', async () => {
    const e = await h['calendar.create']({ event: allDay('시험', '2026-12-01') })
    expect(await h['calendar.get']({ id: e.id })).toEqual(e)
    expect(await h['calendar.get']({ id: '00000000-0000-7000-8000-999999999999' })).toBeNull()
    expect(await codeOf(h['calendar.get']({ id: '../x' }))).toBe('invalid_input')
  })
  it('upcoming: 지난 일정은 빼고, limit은 1~50', async () => {
    await h['calendar.create']({ event: allDay('지난', '2026-01-01') })
    const next = await h['calendar.create']({ event: allDay('다음', '2026-12-01') })
    const r = await h['calendar.upcoming']({ fromUtc: 0, fromDate: '2026-10-15', limit: 5 })
    expect(r.map((e) => e.id)).toEqual([next.id])
    for (const limit of [0, 51, 1.5])
      expect(
        await codeOf(h['calendar.upcoming']({ fromUtc: 0, fromDate: '2026-10-15', limit })),
      ).toBe('invalid_input')
    expect(
      await codeOf(h['calendar.upcoming']({ fromUtc: 0, fromDate: '2026-1-1', limit: 5 })),
    ).toBe('invalid_input')
  })
})

describe('timer', () => {
  it('명령으로만 상태를 바꾸고 저장한다', async () => {
    expect((await h['timer.get'](undefined)).status).toBe('idle')
    const s = await h['timer.command']({ cmd: 'start', durationMs: 60000, mode: 'focus' })
    expect(s).toMatchObject({ status: 'running', endsAt: env.clock.now + 60000 })
    expect(env.core.repos.timer.get()?.status).toBe('running')
  })
  it('잘못된 명령은 invalid_input', async () => {
    expect(await codeOf(h['timer.command']({ cmd: 'start', durationMs: 10, mode: 'focus' }))).toBe(
      'invalid_input',
    )
    expect(await codeOf(h['timer.command']({ cmd: 'explode' }))).toBe('invalid_input')
    expect(
      await codeOf(h['timer.command']({ cmd: 'pause', endsAt: 0 })), // 미지의 키
    ).toBe('invalid_input')
  })
  it('뽀모도로 설정: 부분 업데이트, 범위 밖/미지의 키 거부, 대기 중 단계 길이 반영', async () => {
    await h['timer.command']({ cmd: 'pomodoro.start' })
    await h['timer.command']({ cmd: 'reset' })
    const s = await h['timer.pomodoro.update']({ patch: { focusMin: 40 } })
    expect(s).toMatchObject({ focusMin: 40, shortBreakMin: 5 })
    expect((await h['timer.get'](undefined)).durationMs).toBe(40 * 60000)
    expect(await codeOf(h['timer.pomodoro.update']({ patch: { focusMin: 0 } }))).toBe(
      'invalid_input',
    )
    expect(await codeOf(h['timer.pomodoro.update']({ patch: { label: 'x' } }))).toBe(
      'invalid_input',
    )
  })
  it('기록 조회: 1분 넘게 돌다 멈춘 타이머가 남는다', async () => {
    await h['timer.command']({ cmd: 'start', durationMs: 10 * 60000, mode: 'focus' })
    env.clock.now += 3 * 60000
    await h['timer.command']({ cmd: 'reset' })
    const list = await h['timer.sessions']({ fromMs: 0, toMs: env.clock.now + 1 })
    expect(list).toEqual([expect.objectContaining({ actualMs: 3 * 60000, completed: false })])
    expect(await codeOf(h['timer.sessions']({ fromMs: -1, toMs: 0 }))).toBe('invalid_input')
  })
})

describe('miniTimer', () => {
  it('열기/닫기, 설정은 저장 후 창에 반영, 잘못된 입력 거부', async () => {
    await h['miniTimer.open'](undefined)
    expect((await h['miniTimer.prefs'](undefined)).alwaysOnTop).toBe(true) // 기본값
    expect(await h['miniTimer.update']({ patch: { alwaysOnTop: false } })).toEqual({
      alwaysOnTop: false,
    })
    expect((await h['miniTimer.prefs'](undefined)).alwaysOnTop).toBe(false)
    await h['miniTimer.close'](undefined)
    expect(miniCalls).toEqual(['open', 'apply:false', 'close'])
    expect(await codeOf(h['miniTimer.update']({ patch: { alwaysOnTop: 'yes' } }))).toBe(
      'invalid_input',
    )
    expect(await codeOf(h['miniTimer.open']({ url: 'https://x' }))).toBe('invalid_input')
  })
})

describe('memos', () => {
  it('만들기/고치기/고정/삭제, 고정만 바꾸면 수정 시각 유지', async () => {
    const a = await h['memos.create']({})
    expect(a.body).toBe('')
    env.clock.now += 1000
    const b = await h['memos.create']({ body: '# 장보기\n- [ ] 우유' })
    expect((await h['memos.list'](undefined)).map((m) => m.id)).toEqual([b.id, a.id])

    env.clock.now += 1000
    const pinned = await h['memos.update']({ id: a.id, patch: { pinned: true } })
    expect(pinned.updatedAt).toBe(a.updatedAt)
    expect((await h['memos.list'](undefined)).map((m) => m.id)).toEqual([a.id, b.id])

    const edited = await h['memos.update']({ id: b.id, patch: { body: '- [x] 우유' } })
    expect(edited.updatedAt).toBe(env.clock.now)
    expect(edited.pinned).toBe(false)

    await h['memos.delete']({ id: a.id })
    expect(await codeOf(h['memos.delete']({ id: a.id }))).toBe('not_found')
    expect(await codeOf(h['memos.update']({ id: a.id, patch: { body: 'x' } }))).toBe('not_found')
  })

  it('잘못된 입력 거부', async () => {
    expect(await codeOf(h['memos.create']({ body: 'a'.repeat(20001) }))).toBe('invalid_input')
    expect(await codeOf(h['memos.create']({ html: '<b>x</b>' }))).toBe('invalid_input')
    const m = await h['memos.create']({})
    expect(await codeOf(h['memos.update']({ id: m.id, patch: { createdAt: 1 } }))).toBe(
      'invalid_input',
    )
    expect(await codeOf(h['memos.update']({ id: m.id, patch: { pinned: 'yes' } }))).toBe(
      'invalid_input',
    )
    expect(await codeOf(h['memos.list']({}))).toBe('invalid_input')
  })
})

describe('timetable', () => {
  const content = { subject: '국어', room: '', tone: null }
  const first = async () => (await h['timetable.get'](undefined)).activeId!

  it('처음 시간표, 칸 채우기/고치기/지우기, 이미 채워진 칸은 conflict', async () => {
    const t = await h['timetable.get'](undefined)
    expect(t.timetables).toHaveLength(1)
    expect(t.activeId).toBe(t.timetables[0]!.id)
    expect(t.timetables[0]!.settings.periods).toHaveLength(8)
    expect(t.entries).toEqual([])
    const timetableId = t.activeId!
    const a = await h['timetable.entries.create']({
      timetableId,
      slot: { kind: 'period', day: 0, period: 1 },
      content,
    })
    expect(a.timetableId).toBe(timetableId)
    expect(
      await codeOf(
        h['timetable.entries.create']({
          timetableId,
          slot: { kind: 'period', day: 0, period: 1 },
          content,
        }),
      ),
    ).toBe('conflict')
    env.clock.now += 1000
    const b = await h['timetable.entries.update']({ id: a.id, content: { room: '3-1', tone: 11 } })
    expect(b).toMatchObject({ subject: '국어', room: '3-1', tone: 11, updatedAt: env.clock.now })
    const moved = await h['timetable.entries.update']({
      id: a.id,
      slot: { kind: 'period', day: 2, period: 3 },
    })
    expect(moved.slot).toEqual({ kind: 'period', day: 2, period: 3 })
    await h['timetable.entries.delete']({ id: a.id })
    expect(await codeOf(h['timetable.entries.delete']({ id: a.id }))).toBe('not_found')
  })

  it('교시 수를 줄이면 그 시간표의 뒤 교시 칸만 지워지고, 없는 교시는 거부', async () => {
    const id = await first()
    await h['timetable.entries.create']({
      timetableId: id,
      slot: { kind: 'period', day: 0, period: 8 },
      content,
    })
    await h['timetable.entries.create']({
      timetableId: id,
      slot: { kind: 'time', day: 0, start: '18:00', end: '19:00' },
      content,
    })
    const copy = await h['timetables.create']({ name: '복사본', copyFrom: id })
    const periods = copy.timetables[0]!.settings.periods.slice(0, 6)
    const r = await h['timetables.update']({ id, patch: { settings: { periods, showSat: true } } })
    expect(r.timetables[0]!.settings).toMatchObject({ showSat: true, mode: 'period' })
    expect(r.entries.filter((e) => e.timetableId === id).map((e) => e.slot.kind)).toEqual(['time'])
    expect(r.entries.filter((e) => e.timetableId !== id)).toHaveLength(2)
    expect(
      await codeOf(
        h['timetable.entries.create']({
          timetableId: id,
          slot: { kind: 'period', day: 0, period: 7 },
          content,
        }),
      ),
    ).toBe('not_found')
  })

  it('시간표 만들기(빈/복제), 이름 바꾸기, 고르기, 지우기', async () => {
    const id = await first()
    await h['timetables.update']({ id, patch: { settings: { mode: 'time' } } })
    await h['timetable.entries.create']({
      timetableId: id,
      slot: { kind: 'period', day: 1, period: 2 },
      content,
    })
    env.clock.now += 1000
    const blank = await h['timetables.create']({ name: ' 학원 ' })
    const b = blank.timetables[1]!
    expect(b).toMatchObject({ name: '학원', settings: { mode: 'period' } })
    expect(blank.activeId).toBe(b.id)
    expect(blank.entries.filter((e) => e.timetableId === b.id)).toEqual([])

    const copied = await h['timetables.create']({ name: '2학기', copyFrom: id })
    const c = copied.timetables[2]!
    expect(c.settings.mode).toBe('time')
    const cEntries = copied.entries.filter((e) => e.timetableId === c.id)
    expect(cEntries).toEqual([
      expect.objectContaining({ subject: '국어', slot: { kind: 'period', day: 1, period: 2 } }),
    ])
    // 복제는 새 ID
    expect(copied.entries.filter((e) => e.id === cEntries[0]!.id)).toHaveLength(1)

    const renamed = await h['timetables.update']({ id: c.id, patch: { name: '2학기 시간표' } })
    expect(renamed.timetables[2]!.name).toBe('2학기 시간표')

    expect(await h['timetables.select']({ id })).toBeNull()
    expect((await h['timetable.get'](undefined)).activeId).toBe(id)

    // 고른 시간표를 지우면 첫 시간표로
    const afterDelete = await h['timetables.delete']({ id })
    expect(afterDelete.timetables.map((t) => t.id)).toEqual([b.id, c.id])
    expect(afterDelete.activeId).toBe(b.id)
    expect(afterDelete.entries.every((e) => e.timetableId === c.id)).toBe(true)

    await h['timetables.delete']({ id: b.id })
    await h['timetables.delete']({ id: c.id })
    expect(await h['timetable.get'](undefined)).toEqual({
      timetables: [],
      activeId: null,
      entries: [],
    })
  })

  it('최대 개수, 없는 시간표', async () => {
    for (let n = 1; n < 20; n++) await h['timetables.create']({ name: `t${n}` })
    expect(await codeOf(h['timetables.create']({ name: 'over' }))).toBe('conflict')
    const missing = env.newId()
    for (const p of [
      h['timetables.create']({ name: 'x', copyFrom: missing }),
      h['timetables.update']({ id: missing, patch: { name: 'x' } }),
      h['timetables.delete']({ id: missing }),
      h['timetables.select']({ id: missing }),
      h['timetable.entries.create']({
        timetableId: missing,
        slot: { kind: 'period', day: 0, period: 1 },
        content,
      }),
    ])
      expect(await codeOf(p)).toBe('not_found')
  })

  it('잘못된 입력 거부', async () => {
    const id = await first()
    const bad = [
      h['timetable.entries.create']({
        timetableId: id,
        slot: { kind: 'time', day: 0, start: '10:00', end: '09:00' },
        content,
      }),
      h['timetable.entries.create']({
        timetableId: id,
        slot: { kind: 'period', day: 7, period: 1 },
        content,
      }),
      h['timetable.entries.create']({
        timetableId: id,
        slot: { kind: 'period', day: 0, period: 1 },
        content: { ...content, subject: ' ' },
      }),
      h['timetable.entries.create']({
        timetableId: id,
        slot: { kind: 'period', day: 0, period: 1 },
        content: { ...content, html: '<b>' },
      }),
      h['timetable.entries.create']({
        timetableId: id,
        slot: { kind: 'period', day: 0, period: 1 },
        content: { ...content, tone: 12 },
      }),
      h['timetable.entries.create']({
        timetableId: id,
        slot: { kind: 'period', day: 0, period: 1 },
        content: { ...content, tone: '#ff0000' },
      }),
      h['timetable.entries.create']({ slot: { kind: 'period', day: 0, period: 1 }, content }),
      h['timetables.update']({
        id,
        patch: { settings: { periods: [{ start: '10:00', end: '09:00' }] } },
      }),
      h['timetables.update']({ id, patch: { settings: { periods: [] } } }),
      h['timetables.update']({
        id,
        patch: {
          settings: {
            periods: [
              { start: '09:00', end: '10:00' },
              { start: '09:30', end: '10:30' },
            ],
          },
        },
      }),
      h['timetables.update']({ id, patch: { settings: { mode: 'grid' } } }),
      h['timetables.update']({ id, patch: { name: '' } }),
      h['timetables.update']({ id, patch: { name: 'a'.repeat(31) } }),
      h['timetables.update']({ id, patch: { color: '#fff' } }),
      h['timetables.create']({ name: '' }),
      h['timetables.create']({ name: 'x', copyFrom: 'nope' }),
      h['timetables.select']({ id: 'nope' }),
    ]
    for (const p of bad) expect(await codeOf(p)).toBe('invalid_input')
  })
})

describe('themeRules', () => {
  it('없는 테마를 가리키는 규칙은 거부', async () => {
    expect(await codeOf(h['themeRules.create']({ rule: anyRule(env.newId()) }))).toBe('not_found')
  })
})

describe('colorCombos', () => {
  const colors = () => {
    const l = presetLook('cottonCandy')
    return { palette: l.palette, background: l.background }
  }
  it('추가는 앞에, main이 id/시각을 정하고, 지우기', async () => {
    expect(await h['colorCombos.list'](undefined)).toEqual([])
    const a = await h['colorCombos.add']({ name: ' 하늘 ', ...colors() })
    const b = await h['colorCombos.add']({ name: '구름', ...colors() })
    expect(a).toMatchObject({ name: '하늘', createdAt: env.clock.now })
    expect((await h['colorCombos.list'](undefined)).map((c) => c.id)).toEqual([b.id, a.id])
    await h['colorCombos.delete']({ id: a.id })
    expect((await h['colorCombos.list'](undefined)).map((c) => c.id)).toEqual([b.id])
  })
  it('잘못된 색, 모르는 키, 30개 넘게는 거부', async () => {
    const bad = { ...colors(), palette: { ...colors().palette, text: 'red' } }
    expect(await codeOf(h['colorCombos.add']({ name: 'x', ...bad }))).toBe('invalid_input')
    expect(await codeOf(h['colorCombos.add']({ name: 'x', ...colors(), css: 'a' }))).toBe(
      'invalid_input',
    )
    for (let i = 0; i < 30; i++) await h['colorCombos.add']({ name: `c${i}`, ...colors() })
    expect(await codeOf(h['colorCombos.add']({ name: 'over', ...colors() }))).toBe('conflict')
  })
})

describe('sprints', () => {
  const base = { name: '중간고사 대비', startDate: '2026-10-20', endDate: '2026-11-02' }
  it('만들기·고치기·목록, 시작~끝 순서 검사', async () => {
    const s = await h['sprints.create']({ ...base, goal: '수학 오답 정리' })
    expect(s).toMatchObject({ ...base, goal: '수학 오답 정리' })
    expect(await codeOf(h['sprints.create']({ ...base, endDate: '2026-10-01' }))).toBe(
      'invalid_input',
    )
    // 시작만 끝 뒤로 바꾸면 거부
    expect(
      await codeOf(h['sprints.update']({ id: s.id, patch: { startDate: '2026-12-01' } })),
    ).toBe('invalid_input')
    const u = await h['sprints.update']({ id: s.id, patch: { name: '기말 대비' } })
    expect(u.name).toBe('기말 대비')
    expect((await h['sprints.list'](undefined)).map((x) => x.id)).toEqual([s.id])
  })
  it('할 일에 스프린트 연결, 없는 스프린트는 not_found, 스프린트를 지우면 할 일은 남고 연결만 끊긴다', async () => {
    const s = await h['sprints.create'](base)
    const t = await h['todo.items.create']({ listId: null, title: '오답 노트', sprintId: s.id })
    expect(t.sprintId).toBe(s.id)
    expect(
      await codeOf(h['todo.items.create']({ listId: null, title: 'x', sprintId: env.newId() })),
    ).toBe('not_found')
    const moved = await h['todo.items.update']({ id: t.id, patch: { sprintId: null } })
    expect(moved.sprintId).toBeNull()
    await h['todo.items.update']({ id: t.id, patch: { sprintId: s.id } })
    await h['sprints.delete']({ id: s.id })
    const { items } = await h['todo.items.list']({ listId: t.listId })
    expect(items.find((x) => x.id === t.id)?.sprintId).toBeNull()
  })
})

describe('diary', () => {
  const png = () =>
    sharp({ create: { width: 40, height: 30, channels: 3, background: '#3a7bd5' } })
      .png()
      .toBuffer()
      .then((b) => new Uint8Array(b))
  it('준 값만 바꾸고, 다 비우면 지운다', async () => {
    const a = await h['diary.save']({ date: '2026-10-21', body: '시험 끝!', mood: 5 })
    expect(a).toMatchObject({ body: '시험 끝!', mood: 5, photos: [] })
    const b = await h['diary.save']({ date: '2026-10-21', mood: 3 })
    expect(b).toMatchObject({ body: '시험 끝!', mood: 3, createdAt: a!.createdAt })
    expect(await h['diary.save']({ date: '2026-10-21', body: '  ', mood: null })).toBeNull()
    expect(await h['diary.get']({ date: '2026-10-21' })).toBeNull()
  })
  it('사진은 앱이 저장한 것만, 기간 요약, 잘못된 입력 거부', async () => {
    const photo = await h['diary.photoFromBytes']({ bytes: await png() })
    expect(photo.mime).toMatch(/image\/(png|jpeg)/)
    expect(await stat(env.core.diaryPhotos.path(photo))).toBeTruthy()
    await h['diary.save']({ date: '2026-10-20', photos: [photo] })
    expect(
      await codeOf(
        h['diary.save']({
          date: '2026-10-20',
          photos: [{ hash: 'f'.repeat(64), mime: 'image/png' }],
        }),
      ),
    ).toBe('not_found')
    expect(await codeOf(h['diary.save']({ date: '2026-10-20', photos: [photo, photo] }))).toBe(
      'invalid_input',
    )
    expect(await codeOf(h['diary.save']({ date: '2026-10-20', mood: 9 }))).toBe('invalid_input')
    await h['diary.save']({ date: '2026-10-22', body: '맑음' })
    expect(await h['diary.range']({ fromDate: '2026-10-01', toDate: '2026-10-31' })).toEqual([
      { date: '2026-10-20', mood: null, hasText: false, photoCount: 1 },
      { date: '2026-10-22', mood: null, hasText: true, photoCount: 0 },
    ])
    expect(await codeOf(h['diary.range']({ fromDate: '2026-01-01', toDate: '2027-12-31' }))).toBe(
      'invalid_input',
    )
  })
  it('일기에서 빠진 사진 파일은 유예 시간이 지나면 정리된다', async () => {
    const photo = await h['diary.photoFromBytes']({ bytes: await png() })
    const store = env.core.diaryPhotos
    expect(await store.prune(new Set(), 10 * 60 * 1000, Date.now())).toBe(0) // 방금 만든 파일은 남긴다
    expect(await store.prune(new Set([photo.hash]), 0, Date.now() + 1000)).toBe(0)
    expect(await store.prune(new Set(), 0, Date.now() + 1000)).toBe(1)
    expect(await store.exists(photo)).toBe(false)
  })
})

describe('habits', () => {
  it('만들기(기본 매일)·고치기·체크·기간 조회·지우면 체크도 사라짐', async () => {
    const a = await h['habits.create']({ name: '물 2L' })
    expect(a).toMatchObject({ name: '물 2L', days: 127, order: 0 })
    const b = await h['habits.create']({ name: '운동', days: 0b0111110, color: '#e58f8f' })
    expect(b.order).toBe(1)
    expect(await codeOf(h['habits.create']({ name: 'x', days: 0 }))).toBe('invalid_input')
    expect(await codeOf(h['habits.create']({ name: 'x', days: 128 }))).toBe('invalid_input')
    await h['habits.update']({ id: a.id, patch: { name: '물 1.5L' } })
    await h['habits.check']({ habitId: a.id, date: '2026-10-20', done: true })
    await h['habits.check']({ habitId: a.id, date: '2026-10-20', done: true }) // 두 번 켜도 하나
    await h['habits.check']({ habitId: b.id, date: '2026-10-21', done: true })
    expect(await h['habits.checks']({ fromDate: '2026-10-01', toDate: '2026-10-31' })).toEqual([
      { habitId: a.id, date: '2026-10-20' },
      { habitId: b.id, date: '2026-10-21' },
    ])
    await h['habits.check']({ habitId: a.id, date: '2026-10-20', done: false })
    expect(
      await codeOf(h['habits.check']({ habitId: env.newId(), date: '2026-10-20', done: true })),
    ).toBe('not_found')
    await h['habits.reorder']({ ids: [b.id, a.id] })
    expect((await h['habits.list'](undefined)).map((x) => x.name)).toEqual(['운동', '물 1.5L'])
    await h['habits.delete']({ id: b.id })
    expect(await h['habits.checks']({ fromDate: '2026-10-01', toDate: '2026-10-31' })).toEqual([])
  })
})
