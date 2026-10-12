import type { Theme } from '@kkumikkumi/schema'
import { useEffect, useState } from 'react'
import { BoardScreen } from './app/BoardScreen'
import { TitleBar } from './app/TitleBar'
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
  // 테마가 바뀌면(M6) 에디터 상태를 새로 만든다
  return <BoardScreen key={load.theme.id} initialTheme={load.theme} data={load.data} />
}
