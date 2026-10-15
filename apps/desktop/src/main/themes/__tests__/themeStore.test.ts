import { mkdtemp, readdir, readFile, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  BUILTIN_THEME_IDS,
  presetLook,
  THEME_PRESETS,
  type Asset,
  type Theme,
  type ThemeTemplateId,
} from '@kkumikkumi/schema'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { assetFileName, ThemeStore, ThemeStoreError } from '../themeStore'

let root: string
let clock: number
let seq: number
let store: ThemeStore

const newId = () => `00000000-0000-7000-8000-${String(++seq).padStart(12, '0')}`

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'kkumi-themes-'))
  clock = 1_000_000
  seq = 0
  store = new ThemeStore(root, { now: () => clock, newId })
})
afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

const code = async (p: Promise<unknown>): Promise<string> => {
  try {
    await p
    return 'resolved'
  } catch (e) {
    return e instanceof ThemeStoreError ? e.code : `other:${String(e)}`
  }
}

const asset = (c: string): Asset => ({
  hash: c.repeat(64),
  mime: 'image/png',
  width: 1,
  height: 1,
  bytes: 1,
})

/** 첫 image 블록이 에셋을 참조하도록 바꾼 테마 */
const withImage = (t: Theme, a: Asset): Theme => ({
  ...t,
  assets: [...t.assets, a],
  blocks: t.blocks.map((b, i) =>
    i === t.blocks.findIndex((x) => x.type === 'image') && b.type === 'image'
      ? { ...b, props: { ...b.props, assetHash: a.hash } }
      : b,
  ),
})

const opts = (name: string, template: ThemeTemplateId = 'classic') => ({
  ...presetLook('pudding'),
  name,
  template,
})

describe('ThemeStore', () => {
  it('create → read → list', async () => {
    const t = await store.create(opts('아침'))
    expect(await store.read(t.id)).toEqual(t)
    expect(await store.list()).toEqual([
      {
        id: t.id,
        ok: true,
        name: '아침',
        updatedAt: clock,
        builtin: false,
        palette: THEME_PRESETS.pudding.palette,
        bgColor: THEME_PRESETS.pudding.background.color,
        pattern: THEME_PRESETS.pudding.background.pattern,
        fontId: 'pretendard',
      },
    ])
  })

  it('create: 고른 색·무늬·글꼴·템플릿으로 만든다', async () => {
    const t = await store.create({
      ...presetLook('cottonCandy'),
      background: { color: '#daecf6', pattern: null },
      fontId: 'galmuri11',
      name: '솜사탕',
      template: 'blank',
    })
    expect(t.defaults.palette).toEqual(THEME_PRESETS.cottonCandy.palette)
    expect(t.background).toEqual({ type: 'color', color: '#daecf6', pattern: null })
    expect(t.defaults.fontId).toBe('galmuri11')
    expect(t.blocks).toEqual([])
  })

  it('ensureBuiltins: 기본 테마 2개를 고정 ID로 만들고, 다시 불러도 그대로', async () => {
    expect(await store.ensureBuiltins()).toBe(BUILTIN_THEME_IDS.pudding)
    const first = await store.list()
    expect(first.map((s) => s.ok && s.name)).toEqual(['푸딩 아침', '코튼캔디'])
    expect(first.every((s) => s.ok && s.builtin)).toBe(true)
    clock += 1000
    await store.ensureBuiltins()
    expect(await store.list()).toEqual(first)
  })

  it('ensureBuiltins: 손상된 기본 테마는 건드리지 않고 다음 기본 테마를 돌려준다', async () => {
    await store.ensureBuiltins()
    const file = join(root, BUILTIN_THEME_IDS.pudding, 'theme.json')
    await writeFile(file, '{broken')
    expect(await store.ensureBuiltins()).toBe(BUILTIN_THEME_IDS.cottonCandy)
    expect(await readFile(file, 'utf8')).toBe('{broken')
  })

  it('list: 기본 테마(프리셋 순) → 내 테마(최근 순)', async () => {
    const a = await store.create(opts('a'))
    clock += 1
    const b = await store.create(opts('b'))
    clock += 1
    await store.ensureBuiltins()
    expect((await store.list()).map((s) => s.id)).toEqual([
      BUILTIN_THEME_IDS.pudding,
      BUILTIN_THEME_IDS.cottonCandy,
      b.id,
      a.id,
    ])
  })

  it('기본 테마는 이름 바꾸기·삭제 불가', async () => {
    await store.ensureBuiltins()
    await store.create(opts('a'))
    expect(await code(store.rename(BUILTIN_THEME_IDS.pudding, 'x'))).toBe('builtin_theme')
    expect(await code(store.delete(BUILTIN_THEME_IDS.cottonCandy))).toBe('builtin_theme')
  })

  it('resetBuiltin: 처음 상태로(생성 시각은 유지), 손상된 것도 되돌린다, 내 테마는 거부', async () => {
    await store.ensureBuiltins()
    const id = BUILTIN_THEME_IDS.cottonCandy
    const t = await store.read(id)
    await store.save({ ...t, defaults: { ...t.defaults, fontId: 'galmuri11' }, blocks: [] })
    clock += 5000
    const r = await store.resetBuiltin(id)
    expect(r).toMatchObject({ id, name: '코튼캔디', createdAt: t.createdAt, updatedAt: clock })
    expect(r.defaults).toEqual(t.defaults)
    expect(r.blocks.map((b) => b.type)).toEqual(['image', 'calendar', 'todo'])
    expect(await store.read(id)).toEqual(r)

    await writeFile(join(root, id, 'theme.json'), '{broken')
    await store.resetBuiltin(id)
    expect((await store.read(id)).name).toBe('코튼캔디')

    const mine = await store.create(opts('a'))
    expect(await code(store.resetBuiltin(mine.id))).toBe('not_found')
  })

  it('ensureAtLeastOne: 비어 있으면 기본 테마 생성, 있으면 재사용', async () => {
    const id = await store.ensureAtLeastOne('기본')
    expect(await store.ensureAtLeastOne('기본')).toBe(id)
    expect((await store.list()).length).toBe(1)
  })

  it('save: 검증 실패면 파일을 바꾸지 않는다', async () => {
    const t = await store.create(opts('a'))
    const before = await readFile(join(root, t.id, 'theme.json'), 'utf8')
    const bad = {
      ...t,
      blocks: t.blocks.map((b) => (b.type === 'calendar' ? { ...b, size: 'S' as const } : b)),
    }
    expect(await code(store.save(bad))).toBe('invalid_schema')
    expect(await readFile(join(root, t.id, 'theme.json'), 'utf8')).toBe(before)
  })

  it('save: 매니페스트의 에셋 파일이 없으면 거부, 있으면 저장', async () => {
    const t = await store.create(opts('a'))
    const a = asset('a')
    expect(await code(store.save(withImage(t, a)))).toBe('missing_asset_file')
    await store.writeAsset(t.id, a, new Uint8Array([1]))
    await store.save(withImage(t, a))
    expect((await store.read(t.id)).assets).toEqual([a])
  })

  it('save: 임시 파일을 남기지 않는다', async () => {
    const t = await store.create(opts('a'))
    await store.save({ ...t, name: 'b' })
    expect(await readdir(join(root, t.id))).toEqual(['assets', 'theme.json'])
  })

  it('read: 손상된 JSON / 스키마 위반 / 미래 버전 / ID 불일치는 오류, 파일은 그대로', async () => {
    const t = await store.create(opts('a'))
    const file = join(root, t.id, 'theme.json')
    const cases: [string, string][] = [
      ['{not json', 'invalid_json'],
      [JSON.stringify({ ...t, extra: 1 }), 'invalid_schema'],
      [JSON.stringify({ ...t, schemaVersion: 99 }), 'future_version'],
      [JSON.stringify({ ...t, id: newId() }), 'id_mismatch'],
    ]
    for (const [text, expected] of cases) {
      await writeFile(file, text)
      expect(await code(store.read(t.id))).toBe(expected)
      expect(await readFile(file, 'utf8')).toBe(text)
    }
    expect(await store.list()).toEqual([{ id: t.id, ok: false, error: 'id_mismatch' }])
  })

  it('잘못된 ID는 경로를 만들기 전에 거부 (경로 탈출 방지)', async () => {
    expect(await code(store.read('../etc'))).toBe('invalid_id')
    expect(await code(store.read('00000000-0000-7000-8000-000000000001/../x'))).toBe('invalid_id')
  })

  it('duplicate: 새 ID와 이름, 에셋 복사, 원본 유지', async () => {
    const t = await store.create(opts('원본'))
    const a = asset('b')
    await store.writeAsset(t.id, a, new Uint8Array([7]))
    await store.save(withImage(t, a))
    clock += 10
    const c = await store.duplicate(t.id, '사본')
    expect(c.id).not.toBe(t.id)
    expect(c.name).toBe('사본')
    expect(c.createdAt).toBe(clock)
    expect(await readFile(join(root, c.id, 'assets', assetFileName(a)))).toEqual(Buffer.from([7]))
    expect((await store.read(t.id)).name).toBe('원본')
  })

  it('rename', async () => {
    const t = await store.create(opts('a'))
    clock += 5
    const r = await store.rename(t.id, '  새 이름 ')
    expect(r).toMatchObject({ name: '새 이름', updatedAt: clock })
  })

  it('delete: 마지막 테마는 거부, 그 외는 폴더 삭제', async () => {
    const a = await store.create(opts('a'))
    expect(await code(store.delete(a.id))).toBe('last_theme')
    const b = await store.create(opts('b'))
    await store.delete(a.id)
    expect((await store.list()).map((s) => s.id)).toEqual([b.id])
    expect((await readdir(root)).filter((n) => n.startsWith('.'))).toEqual([])
    expect(await code(store.delete(a.id))).toBe('not_found')
  })

  it('pruneAssets: 참조 안 하는 매니페스트 항목과 오래된 고아 파일 삭제, 최근 파일은 유예', async () => {
    const t = await store.create(opts('a'))
    const used = asset('c')
    const unusedInManifest = asset('d')
    await store.writeAsset(t.id, used, new Uint8Array([1]))
    await store.writeAsset(t.id, unusedInManifest, new Uint8Array([2]))
    await store.save({ ...withImage(t, used), assets: [used, unusedInManifest] })

    const dir = join(root, t.id, 'assets')
    const oldOrphan = `${'e'.repeat(64)}.png`
    const recentOrphan = `${'f'.repeat(64)}.jpg`
    const stray = 'notes.txt'
    for (const n of [oldOrphan, recentOrphan, stray]) await writeFile(join(dir, n), 'x')
    const old = new Date(clock - 60_000)
    for (const n of [oldOrphan, assetFileName(unusedInManifest), stray])
      await utimes(join(dir, n), old, old)
    await utimes(join(dir, recentOrphan), new Date(clock), new Date(clock))

    expect(await store.pruneAssets(t.id, 10_000)).toEqual({ manifest: 1, files: 2 })
    expect((await readdir(dir)).sort()).toEqual([assetFileName(used), recentOrphan, stray].sort())
    expect((await store.read(t.id)).assets).toEqual([used])
  })
})
