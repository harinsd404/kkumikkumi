import { createRoot } from 'react-dom/client'
import { createDefaultTheme } from '@kkumikkumi/schema'
import { Board } from '../../src/renderer/src/board/Board'
import '../../src/renderer/src/app/app.css'

const id = (n: number) => `00000000-0000-7000-8000-${String(n).padStart(12, '0')}`
const theme = createDefaultTheme({ theme: id(1), blocks: [id(2), id(3), id(4)] }, 0)
createRoot(document.getElementById('root')!).render(
  <div className="app">
    <header style={{ height: 36, flex: 'none' }}>모니터 맞춤 검사</header>
    <main className="app-board">
      <div className="app-stage">
        <Board theme={theme} assetUrl={() => null} />
      </div>
    </main>
  </div>,
)
