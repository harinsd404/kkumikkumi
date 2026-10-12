import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
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
    expect(list).toHaveLength(1)
    expect(repos.settings.get()).toMatchObject({ activeThemeId: list[0]!.id, petEnabled: false })
    expect(repos.todo.lists().map((l) => l.name)).toEqual(['할 일'])
    await env.cleanup()
  })

  it('두 번째 실행은 아무것도 새로 만들지 않는다', async () => {
    const dir = await tmp()
    const a = await makeEnv(dir)
    const settings = a.core.repos.settings.get()
    await a.cleanup()
    const b = await makeEnv(dir)
    expect(await b.core.themes.list()).toHaveLength(1)
    expect(b.core.repos.settings.get()).toEqual(settings)
    expect(b.core.repos.todo.lists()).toHaveLength(1)
    await b.cleanup()
  })

  it('활성 테마 폴더가 사라지면 남은/새 테마로 복구', async () => {
    const dir = await tmp()
    const a = await makeEnv(dir)
    const oldId = a.core.repos.settings.get()!.activeThemeId
    await a.cleanup()
    await rm(join(dir, 'themes', oldId), { recursive: true })
    const b = await makeEnv(dir, 1000)
    const active = b.core.repos.settings.get()!.activeThemeId
    expect(active).not.toBe(oldId)
    expect((await b.core.themes.list()).map((s) => s.id)).toEqual([active])
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
