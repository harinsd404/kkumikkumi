import { useEffect, useState } from 'react'

// M1 연결 확인용 임시 화면. 보드 렌더러는 M2에서 만든다.
export function App() {
  const [status, setStatus] = useState('불러오는 중…')

  useEffect(() => {
    void (async () => {
      const settings = await window.kkumi.invoke('settings.get')
      if (!settings.ok) return setStatus(`설정 오류: ${settings.error.code}`)
      const theme = await window.kkumi.invoke('themes.get', { id: settings.value.activeThemeId })
      if (!theme.ok) return setStatus(`테마 오류: ${theme.error.code}`)
      const todo = await window.kkumi.invoke('todo.items.list', { listId: null })
      if (!todo.ok) return setStatus(`투두 오류: ${todo.error.code}`)
      setStatus(
        `활성 테마: ${theme.value.name} · 블록 ${theme.value.blocks.length}개 · 기본 목록: ${todo.value.list.name}`,
      )
    })()
  }, [])

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: 24 }}>
      <h1>꾸미꾸미</h1>
      <p>platform: {window.kkumi.platform}</p>
      <p data-testid="status">{status}</p>
    </main>
  )
}
