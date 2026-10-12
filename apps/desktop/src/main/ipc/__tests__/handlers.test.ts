import { stat } from 'node:fs/promises'
import type { Theme } from '@kkumikkumi/schema'
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
    const saved = await h['themes.save']({ theme: { ...t, name: '바뀜', updatedAt: 1 } })
    expect(saved).toMatchObject({ name: '바뀜', updatedAt: env.clock.now })
  })

  it('save: 스키마 위반(겹침)은 거부', async () => {
    const t = await h['themes.get']({ id: activeId() })
    const bad: Theme = { ...t, blocks: t.blocks.map((b) => ({ ...b, col: 0, row: 0 })) }
    expect(await codeOf(h['themes.save']({ theme: bad }))).toBe('invalid_input')
  })

  it('delete: 활성 테마를 지우면 다른 테마로 전환하고 규칙/오버라이드 정리', async () => {
    const first = activeId()
    const second = await h['themes.create']({ name: '둘째' })
    await h['themeRules.create']({ rule: anyRule(first) })
    await h['settings.update']({ patch: { manualOverride: { themeId: first, until: null } } })
    const s = await h['themes.delete']({ id: first })
    expect(s).toMatchObject({ activeThemeId: second.id, manualOverride: null })
    expect(await h['themeRules.list'](undefined)).toEqual([])
  })

  it('delete: 마지막 테마는 last_theme', async () => {
    expect(await codeOf(h['themes.delete']({ id: activeId() }))).toBe('last_theme')
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

describe('themeRules', () => {
  it('없는 테마를 가리키는 규칙은 거부', async () => {
    expect(await codeOf(h['themeRules.create']({ rule: anyRule(env.newId()) }))).toBe('not_found')
  })
})
