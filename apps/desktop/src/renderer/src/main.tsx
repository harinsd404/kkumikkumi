import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { MiniTimerApp } from './app/MiniTimerApp'
import { registerBundledFonts } from './board/fonts'

registerBundledFonts()

const isMini = window.location.hash === '#mini'
if (isMini) document.documentElement.classList.add('is-mini')

const root = document.getElementById('root')
if (!root) throw new Error('#root 요소가 없습니다')

createRoot(root).render(
  <StrictMode>
    {/* 같은 renderer를 미니 타이머 창(#mini)에서도 쓴다 */}
    {isMini ? <MiniTimerApp /> : <App />}
  </StrictMode>,
)
