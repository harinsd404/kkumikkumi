import { mkdir, readdir, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { ASSET_EXT_BY_MIME, Sha256, type DiaryPhoto } from '@kkumikkumi/schema'
import { ASSET_FILE_RE } from '../assets/assetUrl'
import { TMP_MARKER, writeFileAtomic } from '../fsutil'

/**
 * 일기 사진 파일: <root>/<sha256>.<png|jpg>. 테마 에셋과 따로 둔다(테마 내보내기에 들어가지 않는다).
 * 이름이 내용 해시라 같은 사진은 한 번만 저장된다.
 */
export class DiaryPhotoStore {
  constructor(private readonly root: string) {}

  path(p: DiaryPhoto): string {
    if (!Sha256.safeParse(p.hash).success) throw new Error('invalid_hash')
    return join(this.root, `${p.hash}.${ASSET_EXT_BY_MIME[p.mime]}`)
  }

  async exists(p: DiaryPhoto): Promise<boolean> {
    const st = await stat(this.path(p)).catch(() => null)
    return !!st?.isFile()
  }

  async write(p: DiaryPhoto, data: Uint8Array): Promise<void> {
    await mkdir(this.root, { recursive: true, mode: 0o700 })
    if (await this.exists(p)) return
    await writeFileAtomic(this.path(p), data)
  }

  /** 일기에서 쓰지 않는 사진 파일을 지운다. graceMs 안에 만든 파일은 남긴다(아직 저장 전인 사진). */
  async prune(keep: ReadonlySet<string>, graceMs: number, now: number): Promise<number> {
    let names: string[]
    try {
      names = await readdir(this.root)
    } catch {
      return 0
    }
    let removed = 0
    for (const name of names) {
      const m = ASSET_FILE_RE.exec(name)
      if (!m && !name.includes(TMP_MARKER)) continue // 모르는 파일은 건드리지 않는다
      if (m && keep.has(m[1]!)) continue
      const p = join(this.root, name)
      const st = await stat(p).catch(() => null)
      if (!st?.isFile() || st.mtimeMs > now - graceMs) continue
      await rm(p, { force: true })
      removed++
    }
    return removed
  }
}
