import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { bootstrap, type AppCore } from '../bootstrap'

export interface TestEnv {
  dir: string
  core: AppCore
  clock: { now: number }
  newId(): string
  cleanup(): Promise<void>
}

/** idStart: 같은 폴더로 여러 번 부팅할 때 ID가 겹치지 않도록 구간을 나눈다 */
export async function makeEnv(dir?: string, idStart = 0): Promise<TestEnv> {
  const root = dir ?? (await mkdtemp(join(tmpdir(), 'kkumi-app-')))
  const clock = { now: 1_700_000_000_000 }
  let seq = idStart
  const newId = () => `00000000-0000-7000-8000-${String(++seq).padStart(12, '0')}`
  const core = await bootstrap({
    userDataDir: root,
    now: () => clock.now,
    newId,
    defaultThemeName: '기본',
    defaultListName: '할 일',
  })
  return {
    dir: root,
    core,
    clock,
    newId,
    cleanup: async () => {
      core.db.close()
      if (!dir) await rm(root, { recursive: true, force: true })
    },
  }
}
