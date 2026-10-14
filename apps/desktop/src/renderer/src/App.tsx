import type { Theme } from '@kkumikkumi/schema'
import { useCallback, useEffect, useState } from 'react'
import { BoardScreen } from './app/BoardScreen'
import { TitleBar, type AppPage } from './app/TitleBar'
import './app/app.css'

type Load =
  { state: 'loading' } | { state: 'error'; code: string } | { state: 'ready'; theme: Theme }

export function App() {
  const [load, setLoad] = useState<Load>({ state: 'loading' })
  /** 테마를 바꿔도 보던 화면은 그대로 */
  const [page, setPage] = useState<AppPage>('board')

  useEffect(() => {
    void (async () => {
      const settings = await window.kkumi.invoke('settings.get')
      if (!settings.ok) return setLoad({ state: 'error', code: settings.error.code })
      const theme = await window.kkumi.invoke('themes.get', { id: settings.value.activeThemeId })
      if (!theme.ok) return setLoad({ state: 'error', code: theme.error.code })
      setLoad({ state: 'ready', theme: theme.value })
    })()
  }, [])

  /** 활성 테마 바꾸기. 테마를 먼저 읽어 보고 성공하면 설정을 바꾼다. */
  const switchTheme = useCallback(async (id: string, from: AppPage): Promise<boolean> => {
    const theme = await window.kkumi.invoke('themes.get', { id })
    if (!theme.ok) return false
    const s = await window.kkumi.invoke('settings.update', { patch: { activeThemeId: id } })
    if (!s.ok) return false
    setPage(from)
    setLoad({ state: 'ready', theme: theme.value })
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
      key={load.theme.id}
      initialTheme={load.theme}
      initialPage={page}
      onSwitchTheme={switchTheme}
    />
  )
}
