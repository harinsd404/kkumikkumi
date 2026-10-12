import { randomBytes } from 'node:crypto'
import { open, rename, rm } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'

export const TMP_MARKER = '.tmp-'

/** 같은 폴더의 임시 파일에 쓰고 fsync 후 rename. 중간에 실패해도 기존 파일은 그대로 남는다. */
export async function writeFileAtomic(path: string, data: string | Uint8Array): Promise<void> {
  const dir = dirname(path)
  const tmp = join(dir, `${basename(path)}${TMP_MARKER}${randomBytes(6).toString('hex')}`)
  const fh = await open(tmp, 'wx', 0o600)
  try {
    await fh.writeFile(data)
    await fh.sync()
  } catch (err) {
    await fh.close().catch(() => {})
    await rm(tmp, { force: true })
    throw err
  }
  await fh.close()
  try {
    await rename(tmp, path)
  } catch (err) {
    await rm(tmp, { force: true })
    throw err
  }
  await fsyncDir(dir)
}

/** rename을 디스크에 반영하기 위한 폴더 fsync. 지원하지 않는 환경에서는 무시한다. */
export async function fsyncDir(dir: string): Promise<void> {
  try {
    const fh = await open(dir, 'r')
    try {
      await fh.sync()
    } finally {
      await fh.close()
    }
  } catch {
    // 일부 파일시스템은 폴더 fsync를 지원하지 않는다.
  }
}
