import { mkdtemp, readFile, rm, stat, utimes } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { BUILTIN_THEME_IDS, presetLook, type Asset } from '@kkumikkumi/schema'
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

  it('재시작 때만 오래된 미사용 에셋을 정리하고 참조 중인 파일과 최근 파일은 보존한다', async () => {
    const dir = await tmp()
    const a = await makeEnv(dir)
    const store = a.core.themes
    const t = await store.create({ ...presetLook('pudding'), name: '사진', template: 'classic' })
    const assets: Asset[] = ['a', 'b', 'c'].map((c) => ({
      hash: c.repeat(64),
      mime: 'image/png',
      width: 1,
      height: 1,
      bytes: 1,
    }))
    const [used, unused, recent] = assets as [Asset, Asset, Asset]
    for (const asset of assets) {
      await store.writeAsset(t.id, asset, new Uint8Array([1]))
      const date = new Date(a.clock.now - (asset === recent ? 0 : 11 * 60 * 1000))
      await utimes(store.assetPath(t.id, asset), date, date)
    }
    const withImage = {
      ...t,
      assets,
      blocks: t.blocks.map((b) =>
        b.type === 'image' ? { ...b, props: { ...b.props, assetHash: used.hash } } : b,
      ),
    }
    await store.save(withImage)
    // 삭제 → 저장 → 실행취소해도 같은 세션에서는 이미지를 복원할 수 있다.
    await store.save({ ...withImage, blocks: [] })
    await store.save(withImage)
    expect(await readFile(store.assetPath(t.id, used))).toEqual(Buffer.from([1]))
    await a.cleanup()

    const b = await makeEnv(dir, 1000)
    try {
      const loaded = await b.core.themes.read(t.id)
      expect(loaded.assets).toEqual([used])
      expect((await stat(b.core.themes.assetPath(t.id, used))).isFile()).toBe(true)
      expect((await stat(b.core.themes.assetPath(t.id, recent))).isFile()).toBe(true)
      await expect(stat(b.core.themes.assetPath(t.id, unused))).rejects.toMatchObject({
        code: 'ENOENT',
      })
      await expect(b.core.themes.save(loaded)).resolves.toBeDefined()
    } finally {
      await b.cleanup()
    }
  })

  it('정리 중 에셋 누락 오류가 나도 앱 시작을 막거나 테마를 덮어쓰지 않는다', async () => {
    const dir = await tmp()
    const a = await makeEnv(dir)
    const t = await a.core.themes.create({
      ...presetLook('pudding'),
      name: '사진',
      template: 'classic',
    })
    const asset: Asset = { hash: 'a'.repeat(64), mime: 'image/png', width: 1, height: 1, bytes: 1 }
    const unused = { ...asset, hash: 'b'.repeat(64) }
    for (const item of [asset, unused])
      await a.core.themes.writeAsset(t.id, item, new Uint8Array([1]))
    const saved = await a.core.themes.save({
      ...t,
      assets: [asset, unused],
      blocks: t.blocks.map((b) =>
        b.type === 'image' ? { ...b, props: { ...b.props, assetHash: asset.hash } } : b,
      ),
    })
    await rm(a.core.themes.assetPath(t.id, asset))
    await a.cleanup()
    const b = await makeEnv(dir, 1000)
    try {
      expect(await b.core.themes.read(t.id)).toEqual(saved)
    } finally {
      await b.cleanup()
    }
  })
})
