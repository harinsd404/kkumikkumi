import { join } from 'node:path'
import { SettingsSchema } from '@kkumikkumi/schema'
import { openDb, transaction, type Db } from './db/connection'
import { migrate } from './db/migrate'
import { migrations } from './db/migrations'
import { createRepos, type Repos } from './db/repos'
import { ThemeStore } from './themes/themeStore'

export interface AppCore {
  db: Db
  repos: Repos
  themes: ThemeStore
}

export interface BootstrapDeps {
  userDataDir: string
  now(): number
  newId(): string
  defaultThemeName: string
  defaultListName: string
}

/**
 * 앱 시작 시 데이터 준비. electron에 의존하지 않아 테스트할 수 있다.
 * 1) DB 열기 + 마이그레이션  2) 내장 기본 테마(푸딩 아침, 코튼캔디)가 없으면 생성
 * 3) 설정이 없거나 활성 테마가 사라졌으면 복구  4) 기본 투두 목록 보장
 */
export async function bootstrap(d: BootstrapDeps): Promise<AppCore> {
  const db = openDb(join(d.userDataDir, 'userdata.db'))
  try {
    migrate(db, migrations)
    const repos = createRepos(db)
    const themes = new ThemeStore(join(d.userDataDir, 'themes'), { now: d.now, newId: d.newId })

    // 기본 테마를 쓸 수 없으면(손상) 남은 테마, 그것도 없으면 새로 만든다
    const fallbackId =
      (await themes.ensureBuiltins()) ?? (await themes.ensureAtLeastOne(d.defaultThemeName))
    const valid = new Set((await themes.list()).filter((s) => s.ok).map((s) => s.id))

    transaction(db, () => {
      let s: ReturnType<Repos['settings']['get']>
      try {
        s = repos.settings.get()
      } catch {
        s = null // 손상된 설정은 기본값으로 다시 만든다(사용자 데이터 아님)
      }
      if (!s) {
        repos.settings.save(
          SettingsSchema.parse({
            schemaVersion: 1,
            activeThemeId: fallbackId,
            petEnabled: false,
            autoSwitchEnabled: false,
            manualOverride: null,
          }),
        )
      } else if (
        !valid.has(s.activeThemeId) ||
        (s.manualOverride && !valid.has(s.manualOverride.themeId))
      ) {
        repos.settings.save({
          ...s,
          activeThemeId: valid.has(s.activeThemeId) ? s.activeThemeId : fallbackId,
          manualOverride:
            s.manualOverride && valid.has(s.manualOverride.themeId) ? s.manualOverride : null,
        })
      }
      if (!repos.todo.defaultList()) {
        const now = d.now()
        repos.todo.insertList({
          id: d.newId(),
          name: d.defaultListName,
          order: 0,
          createdAt: now,
          updatedAt: now,
        })
      }
    })
    return { db, repos, themes }
  } catch (err) {
    db.close()
    throw err
  }
}
