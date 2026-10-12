import type { Theme } from '@kkumikkumi/schema'
import { useEffect, useMemo, useState } from 'react'
import { makeAssetUrl } from './app/assetUrl'
import { TitleBar } from './app/TitleBar'
import { Board } from './board/Board'
import type { BoardData } from './board/BoardContext'
import './app/app.css'

type Load =
  | { state: 'loading' }
  | { state: 'error'; code: string }
  | { state: 'ready'; theme: Theme; data: BoardData }

export function App() {
  const [load, setLoad] = useState<Load>({ state: 'loading' })

  useEffect(() => {
    void (async () => {
      const settings = await window.kkumi.invoke('settings.get')
      if (!settings.ok) return setLoad({ state: 'error', code: settings.error.code })
      const theme = await window.kkumi.invoke('themes.get', { id: settings.value.activeThemeId })
      if (!theme.ok) return setLoad({ state: 'error', code: theme.error.code })
      const todo = await window.kkumi.invoke('todo.items.list', { listId: null })
      setLoad({ state: 'ready', theme: theme.value, data: todo.ok ? { todo: todo.value } : {} })
    })()
  }, [])

  const assetUrl = useMemo(
    () => (load.state === 'ready' ? makeAssetUrl(load.theme) : () => null),
    [load],
  )

  return (
    <div className="app">
      <TitleBar themeName={load.state === 'ready' ? load.theme.name : null} />
      <main className="app-board">
        {load.state === 'ready' && (
          <Board theme={load.theme} assetUrl={assetUrl} data={load.data} />
        )}
        {load.state === 'error' && (
          <p className="app-error">보드를 불러오지 못했어요 ({load.code})</p>
        )}
      </main>
    </div>
  )
}
