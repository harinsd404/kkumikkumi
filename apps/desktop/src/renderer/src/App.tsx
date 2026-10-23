import type { Theme } from '@kkumikkumi/schema'
import { useCallback, useEffect, useState } from 'react'
import { BoardScreen } from './app/BoardScreen'
import { TitleBar, type AppPage } from './app/TitleBar'
import './app/app.css'

type Load =
  | { state: 'loading' }
  | { state: 'error'; code: string }
  /** rev: 같은 테마를 다시 불러와도(수정, 되돌리기) 화면을 새로 만든다 */
  | { state: 'ready'; theme: Theme; rev: number }

export function App() {
  const [load, setLoad] = useState<Load>({ state: 'loading' })
  /** 테마를 바꿔도 보던 화면은 그대로 */
  const [page, setPage] = useState<AppPage>('board')
  useEffect(() => {
    document.body.inert = false
  }, [load])

  useEffect(() => {
    void (async () => {
      const settings = await window.kkumi.invoke('settings.get')
      if (!settings.ok) return setLoad({ state: 'error', code: settings.error.code })
      const theme = await window.kkumi.invoke('themes.get', { id: settings.value.activeThemeId })
      if (!theme.ok) return setLoad({ state: 'error', code: theme.error.code })
      setLoad({ state: 'ready', theme: theme.value, rev: 0 })
    })()
  }, [])

  useEffect(
    () =>
      window.kkumi.onDataChanged((domain) => {
        if (domain !== 'sync') return
        void (async () => {
          const settings = await window.kkumi.invoke('settings.get')
          if (!settings.ok) return setLoad({ state: 'error', code: settings.error.code })
          const theme = await window.kkumi.invoke('themes.get', {
            id: settings.value.activeThemeId,
          })
          if (!theme.ok) return setLoad({ state: 'error', code: theme.error.code })
          setLoad((l) => ({
            state: 'ready',
            theme: theme.value,
            rev: l.state === 'ready' ? l.rev + 1 : 0,
          }))
        })()
      }),
    [],
  )

  /** 활성 테마 바꾸기(같은 테마면 다시 불러오기). 테마를 먼저 읽어 보고 성공하면 설정을 바꾼다. */
  const switchTheme = useCallback(async (id: string, from: AppPage): Promise<boolean> => {
    const theme = await window.kkumi.invoke('themes.get', { id })
    if (!theme.ok) return false
    const s = await window.kkumi.invoke('settings.update', { patch: { activeThemeId: id } })
    if (!s.ok) return false
    setPage(from)
    setLoad((l) => ({
      state: 'ready',
      theme: theme.value,
      rev: l.state === 'ready' ? l.rev + 1 : 0,
    }))
    return true
  }, [])

  if (load.state !== 'ready') {
    return (
      <div className="app">
        <TitleBar themeName={null} editing={false} onToggleEdit={() => {}} />
        <main className="app-board">
          {load.state === 'error' && (
            <p className="app-error">보드를 불러오지 못했어요 ({load.code})</p>
          )}
        </main>
      </div>
    )
  }
  // 테마가 바뀌면 에디터 상태를 새로 만든다
  return (
    <BoardScreen
      key={`${load.theme.id}:${load.rev}`}
      initialTheme={load.theme}
      initialPage={page}
      onPageChange={setPage}
      onSwitchTheme={switchTheme}
    />
  )
}
