import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { BUILTIN_THEME_IDS, presetLook } from '@kkumikkumi/schema'
import { openDb } from '../db/connection'
import { makeEnv } from './helpers'

let dirs: string[] = []
afterEach(async () => {
  for (const d of dirs) await rm(d, { recursive: true, force: true })
  dirs = []
})
const tmp = async () => {
  const d = await mkdtemp(join(tmpdir(), 'kkumi-boot-'))
  dirs.push(d)
  return d
}

describe('bootstrap', () => {
  it('첫 실행: DB, 기본 테마, 설정, 기본 투두 목록을 만든다', async () => {
    const env = await makeEnv(await tmp())
    const { repos, themes } = env.core
    const list = await themes.list()
    expect(list.map((s) => s.id)).toEqual([
      BUILTIN_THEME_IDS.pudding,
      BUILTIN_THEME_IDS.cottonCandy,
    ])
    expect(repos.settings.get()).toMatchObject({
      activeThemeId: BUILTIN_THEME_IDS.pudding,
      petEnabled: false,
    })
    expect(repos.todo.lists().map((l) => l.name)).toEqual(['할 일'])
    await env.cleanup()
  })

  it('두 번째 실행은 아무것도 새로 만들지 않는다', async () => {
    const dir = await tmp()
    const a = await makeEnv(dir)
    const settings = a.core.repos.settings.get()
    await a.cleanup()
    const b = await makeEnv(dir)
    expect(await b.core.themes.list()).toHaveLength(2)
    expect(b.core.repos.settings.get()).toEqual(settings)
    expect(b.core.repos.todo.lists()).toHaveLength(1)
    await b.cleanup()
  })

  it('활성 테마 폴더가 사라지면 기본 테마로 복구', async () => {
    const dir = await tmp()
    const a = await makeEnv(dir)
    const mine = await a.core.themes.create({
      ...presetLook('cottonCandy'),
      name: '내 테마',
      template: 'blank',
    })
    a.core.repos.settings.save({ ...a.core.repos.settings.get()!, activeThemeId: mine.id })
    await a.cleanup()
    await rm(join(dir, 'themes', mine.id), { recursive: true })
    const b = await makeEnv(dir, 1000)
    expect(b.core.repos.settings.get()!.activeThemeId).toBe(BUILTIN_THEME_IDS.pudding)
    await b.cleanup()
  })

  it('기존 사용자: 내 테마는 그대로 두고 기본 테마만 더한다', async () => {
    const dir = await tmp()
    const a = await makeEnv(dir)
    const mine = await a.core.themes.create({
      ...presetLook('pudding'),
      name: '푸딩 아침',
      template: 'classic',
    })
    a.core.repos.settings.save({ ...a.core.repos.settings.get()!, activeThemeId: mine.id })
    await a.cleanup()
    // 이전 버전처럼 기본 테마 폴더가 없는 상태
    await rm(join(dir, 'themes', BUILTIN_THEME_IDS.pudding), { recursive: true })
    await rm(join(dir, 'themes', BUILTIN_THEME_IDS.cottonCandy), { recursive: true })
    const b = await makeEnv(dir, 1000)
    expect(b.core.repos.settings.get()!.activeThemeId).toBe(mine.id)
    expect((await b.core.themes.list()).map((s) => s.id)).toEqual([
      BUILTIN_THEME_IDS.pudding,
      BUILTIN_THEME_IDS.cottonCandy,
      mine.id,
    ])
    await b.cleanup()
  })

  it('손상된 설정은 기본값으로 다시 만든다', async () => {
    const dir = await tmp()
    const a = await makeEnv(dir)
    await a.cleanup()
    const db = openDb(join(dir, 'userdata.db'))
    db.prepare("UPDATE settings SET value = '{broken' WHERE key = 'app'").run()
    db.close()
    const b = await makeEnv(dir)
    expect(b.core.repos.settings.get()?.schemaVersion).toBe(1)
    await b.cleanup()
  })
})
