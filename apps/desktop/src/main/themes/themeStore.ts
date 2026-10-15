import { cp, mkdir, readdir, readFile, rename, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import {
  ASSET_EXT_BY_MIME,
  BUILTIN_THEME_IDS,
  builtinPresetOf,
  createDefaultTheme,
  createTheme,
  THEME_PRESET_IDS,
  THEME_PRESETS,
  type ThemeLook,
  type ThemePresetId,
  type ThemeTemplateId,
  Name,
  presetLook as presetLookFor,
  referencedAssetHashes,
  Sha256,
  ThemeSchema,
  upgradeThemeRaw,
  Uuid,
  type Asset,
  type Theme,
} from '@kkumikkumi/schema'
import type { ThemeErrorCode, ThemeSummary } from '../../shared/api'
import { ASSET_FILE_RE } from '../assets/assetUrl'
import { fsyncDir, TMP_MARKER, writeFileAtomic } from '../fsutil'

export interface StoreDeps {
  now(): number
  newId(): string
}

export class ThemeStoreError extends Error {
  constructor(readonly code: ThemeErrorCode) {
    super(code)
    this.name = 'ThemeStoreError'
  }
}

const THEME_FILE = 'theme.json'
const ASSETS_DIR = 'assets'

export const assetFileName = (a: Pick<Asset, 'hash' | 'mime'>): string =>
  `${a.hash}.${ASSET_EXT_BY_MIME[a.mime]}`

/**
 * 테마 폴더 저장소: <root>/<themeId>/theme.json + assets/<hash>.<ext>
 * - 쓰기는 원자적(임시 파일 → rename, 새 폴더는 임시 폴더 → rename)
 * - 읽기 검증이 실패해도 파일은 건드리지 않는다
 */
export class ThemeStore {
  constructor(
    private readonly root: string,
    private readonly deps: StoreDeps,
  ) {}

  /** 테마별 쓰기 순서 보장: 읽고-고쳐-쓰기(정리, 이름 바꾸기, 되돌리기)가 서로의 저장을 덮어쓰지 않도록 */
  private readonly locks = new Map<string, Promise<unknown>>()

  private locked<T>(id: string, fn: () => Promise<T>): Promise<T> {
    const key = id.toLowerCase()
    const prev = this.locks.get(key) ?? Promise.resolve()
    const run = prev.then(fn, fn)
    const tail = run.catch(() => undefined)
    this.locks.set(key, tail)
    void tail.then(() => {
      if (this.locks.get(key) === tail) this.locks.delete(key)
    })
    return run
  }

  /* ── 경로 (ID/해시를 검증한 뒤에만 경로를 만든다) ── */

  private dir(id: string): string {
    if (!Uuid.safeParse(id).success) throw new ThemeStoreError('invalid_id')
    return join(this.root, id.toLowerCase())
  }

  assetsDir(id: string): string {
    return join(this.dir(id), ASSETS_DIR)
  }

  assetPath(id: string, a: Pick<Asset, 'hash' | 'mime'>): string {
    if (!Sha256.safeParse(a.hash).success) throw new ThemeStoreError('invalid_id')
    return join(this.assetsDir(id), assetFileName(a))
  }

  /* ── 읽기 ── */

  async list(): Promise<ThemeSummary[]> {
    await mkdir(this.root, { recursive: true })
    const entries = await readdir(this.root, { withFileTypes: true })
    const ids = entries
      .filter((e) => e.isDirectory() && Uuid.safeParse(e.name).success)
      .map((e) => e.name)
    const out: ThemeSummary[] = []
    for (const id of ids) {
      try {
        const t = await this.read(id)
        out.push({
          id,
          ok: true,
          name: t.name,
          updatedAt: t.updatedAt,
          builtin: builtinPresetOf(id) !== null,
          palette: t.defaults.palette,
          bgColor: t.background.type === 'color' ? t.background.color : null,
          pattern: t.background.type === 'color' ? t.background.pattern : null,
          fontId: t.defaults.fontId,
        })
      } catch (err) {
        out.push({
          id,
          ok: false,
          error: err instanceof ThemeStoreError ? err.code : 'invalid_json',
        })
      }
    }
    // 기본 테마(프리셋 순서) → 내 테마(최근 수정 순) → 읽을 수 없는 테마
    const rank = (s: ThemeSummary) => {
      const p = builtinPresetOf(s.id)
      return p ? THEME_PRESET_IDS.indexOf(p) : s.ok ? THEME_PRESET_IDS.length : 99
    }
    return out.sort(
      (a, b) => rank(a) - rank(b) || (a.ok && b.ok && !a.builtin ? b.updatedAt - a.updatedAt : 0),
    )
  }

  async read(id: string): Promise<Theme> {
    let text: string
    try {
      text = await readFile(join(this.dir(id), THEME_FILE), 'utf8')
    } catch (err) {
      if (err instanceof ThemeStoreError) throw err
      throw new ThemeStoreError('not_found')
    }
    let raw: unknown
    try {
      raw = JSON.parse(text)
    } catch {
      throw new ThemeStoreError('invalid_json')
    }
    const up = upgradeThemeRaw(raw)
    if (!up.ok) {
      throw new ThemeStoreError(
        up.code === 'future_version'
          ? 'future_version'
          : up.code === 'no_migration'
            ? 'unsupported_version'
            : 'invalid_schema',
      )
    }
    const parsed = ThemeSchema.safeParse(up.value)
    if (!parsed.success) throw new ThemeStoreError('invalid_schema')
    if (parsed.data.id.toLowerCase() !== id.toLowerCase()) throw new ThemeStoreError('id_mismatch')
    return parsed.data
  }

  /* ── 쓰기 ── */

  /**
   * 검증 후 원자적으로 저장. 매니페스트의 에셋 파일이 실제로 있어야 한다.
   * 기본 테마는 이름을 바꿀 수 없다.
   */
  save(theme: Theme): Promise<Theme> {
    return this.locked(theme.id, () => this.saveUnlocked(theme))
  }

  private async saveUnlocked(theme: Theme): Promise<Theme> {
    const parsed = ThemeSchema.safeParse(theme)
    if (!parsed.success) throw new ThemeStoreError('invalid_schema')
    const t = parsed.data
    const preset = builtinPresetOf(t.id)
    if (preset && t.name !== THEME_PRESETS[preset].name) throw new ThemeStoreError('builtin_theme')
    const dir = this.dir(t.id)
    try {
      await stat(join(dir, THEME_FILE))
    } catch {
      throw new ThemeStoreError('not_found')
    }
    await this.assertAssetFiles(t)
    await writeFileAtomic(join(dir, THEME_FILE), JSON.stringify(t, null, 2))
    return t
  }

  /** 새 테마: 외형(색/배경/글꼴) + 배치 템플릿 */
  async create(opts: ThemeLook & { name: string; template: ThemeTemplateId }): Promise<Theme> {
    const t = createTheme({ theme: this.deps.newId(), newId: this.deps.newId }, this.deps.now(), {
      ...opts,
      name: Name.parse(opts.name),
    })
    await this.writeNew(t)
    return t
  }

  async duplicate(id: string, name: string): Promise<Theme> {
    const src = await this.read(id)
    const now = this.deps.now()
    const copy: Theme = {
      ...src,
      id: this.deps.newId(),
      name: Name.parse(name),
      createdAt: now,
      updatedAt: now,
    }
    await this.writeNew(copy, this.assetsDir(id))
    return copy
  }

  async rename(id: string, name: string): Promise<Theme> {
    if (builtinPresetOf(id)) throw new ThemeStoreError('builtin_theme')
    return this.locked(id, async () => {
      const t = await this.read(id)
      return this.saveUnlocked({ ...t, name: Name.parse(name), updatedAt: this.deps.now() })
    })
  }

  /** 마지막 남은 (유효한) 테마는 지우지 않는다. */
  async delete(id: string): Promise<void> {
    const dir = this.dir(id)
    if (builtinPresetOf(id)) throw new ThemeStoreError('builtin_theme')
    const all = await this.list()
    if (!all.some((s) => s.id === id.toLowerCase())) throw new ThemeStoreError('not_found')
    if (all.filter((s) => s.ok && s.id !== id.toLowerCase()).length === 0)
      throw new ThemeStoreError('last_theme')
    const trash = join(this.root, `.trash-${this.deps.newId()}`)
    await rename(dir, trash)
    await fsyncDir(this.root)
    await rm(trash, { recursive: true, force: true })
  }

  /** 에셋 바이트를 assets/<hash>.<ext>로 원자적으로 쓴다. 같은 해시가 있으면 건너뛴다. */
  async writeAsset(themeId: string, asset: Asset, data: Uint8Array): Promise<void> {
    const path = this.assetPath(themeId, asset)
    await mkdir(this.assetsDir(themeId), { recursive: true })
    try {
      await stat(path)
      return
    } catch {
      await writeFileAtomic(path, data)
    }
  }

  /**
   * 고아 에셋 정리.
   * 1) 테마에서 참조하지 않는 매니페스트 항목을 제거하고 저장
   * 2) 매니페스트에 없는 파일과 남은 임시 파일을 삭제. 단, graceMs 안에 수정된 파일은 남긴다
   *    (방금 가져왔지만 아직 테마에 저장되지 않은 에셋 보호)
   */
  pruneAssets(id: string, graceMs: number): Promise<{ manifest: number; files: number }> {
    return this.locked(id, () => this.pruneUnlocked(id, graceMs))
  }

  private async pruneUnlocked(
    id: string,
    graceMs: number,
  ): Promise<{ manifest: number; files: number }> {
    const t = await this.read(id)
    const used = referencedAssetHashes(t)
    const kept = t.assets.filter((a) => used.has(a.hash))
    let manifest = 0
    if (kept.length !== t.assets.length) {
      manifest = t.assets.length - kept.length
      await this.saveUnlocked({ ...t, assets: kept })
    }
    const keepNames = new Set(kept.map(assetFileName))
    const dir = this.assetsDir(id)
    let names: string[]
    try {
      names = await readdir(dir)
    } catch {
      return { manifest, files: 0 }
    }
    const cutoff = this.deps.now() - graceMs
    let files = 0
    for (const name of names) {
      if (keepNames.has(name)) continue
      if (!ASSET_FILE_RE.test(name) && !name.includes(TMP_MARKER)) continue // 모르는 파일은 건드리지 않음
      const p = join(dir, name)
      const st = await stat(p).catch(() => null)
      if (!st || !st.isFile() || st.mtimeMs > cutoff) continue
      await rm(p, { force: true })
      files++
    }
    return { manifest, files }
  }

  /** 기본 테마의 처음 상태(이름/생성 시각은 주어진 값) */
  private builtinTheme(preset: ThemePresetId, now: number): Theme {
    return createDefaultTheme(
      {
        theme: BUILTIN_THEME_IDS[preset],
        blocks: [this.deps.newId(), this.deps.newId(), this.deps.newId()],
      },
      now,
      undefined,
      preset,
    )
  }

  /**
   * 기본 테마가 없으면 만든다. 폴더는 있는데 읽을 수 없으면(손상) 건드리지 않는다.
   * 돌려주는 값: 쓸 수 있는 첫 기본 테마 ID(없으면 null)
   */
  async ensureBuiltins(): Promise<string | null> {
    let first: string | null = null
    for (const preset of THEME_PRESET_IDS) {
      const id = BUILTIN_THEME_IDS[preset]
      try {
        await this.read(id)
      } catch (err) {
        if (!(err instanceof ThemeStoreError && err.code === 'not_found')) continue
        try {
          await stat(this.dir(id))
          continue // 폴더는 있는데 theme.json이 없다: 사용자 파일일 수 있으니 그대로 둔다
        } catch {
          await this.writeNew(this.builtinTheme(preset, this.deps.now()))
        }
      }
      first ??= id
    }
    return first
  }

  /** 기본 테마를 처음 상태로 되돌린다(이전 에셋은 고아가 되어 prune으로 정리). */
  async resetBuiltin(id: string): Promise<Theme> {
    const preset = builtinPresetOf(id)
    if (!preset) throw new ThemeStoreError('not_found')
    return this.locked(id, () => this.resetUnlocked(id, preset))
  }

  private async resetUnlocked(id: string, preset: ThemePresetId): Promise<Theme> {
    const now = this.deps.now()
    const fresh = this.builtinTheme(preset, now)
    try {
      const old = await this.read(id)
      fresh.createdAt = old.createdAt
    } catch {
      // 손상된 기본 테마도 되돌릴 수 있다(사용자가 직접 고른 동작)
    }
    try {
      await stat(this.dir(id))
    } catch {
      await this.writeNew(fresh)
      return fresh
    }
    await writeFileAtomic(join(this.dir(id), THEME_FILE), JSON.stringify(fresh, null, 2))
    return fresh
  }

  /** 유효한 테마가 하나도 없으면 기본 테마를 만든다. 활성 테마 후보 id를 돌려준다. */
  async ensureAtLeastOne(defaultName: string): Promise<string> {
    const first = (await this.list()).find((s) => s.ok)
    if (first) return first.id
    return (
      await this.create({ ...presetLookFor('pudding'), name: defaultName, template: 'classic' })
    ).id
  }

  /* ── 내부 ── */

  private async assertAssetFiles(t: Theme): Promise<void> {
    for (const a of t.assets) {
      try {
        const st = await stat(this.assetPath(t.id, a))
        if (!st.isFile()) throw new Error()
      } catch {
        throw new ThemeStoreError('missing_asset_file')
      }
    }
  }

  /** 임시 폴더에 완성한 뒤 rename으로 새 테마 폴더를 만든다. copyAssetsFrom이 있으면 그 에셋을 복사. */
  private async writeNew(t: Theme, copyAssetsFrom?: string): Promise<void> {
    const parsed = ThemeSchema.safeParse(t)
    if (!parsed.success) throw new ThemeStoreError('invalid_schema')
    await mkdir(this.root, { recursive: true })
    const tmp = join(this.root, `${TMP_MARKER}${this.deps.newId()}`)
    try {
      await mkdir(join(tmp, ASSETS_DIR), { recursive: true })
      for (const a of t.assets) {
        if (!copyAssetsFrom) throw new ThemeStoreError('missing_asset_file')
        await cp(
          join(copyAssetsFrom, assetFileName(a)),
          join(tmp, ASSETS_DIR, assetFileName(a)),
        ).catch(() => {
          throw new ThemeStoreError('missing_asset_file')
        })
      }
      await writeFileAtomic(join(tmp, THEME_FILE), JSON.stringify(parsed.data, null, 2))
      await rename(tmp, this.dir(t.id))
      await fsyncDir(this.root)
    } catch (err) {
      await rm(tmp, { recursive: true, force: true })
      throw err
    }
  }
}
