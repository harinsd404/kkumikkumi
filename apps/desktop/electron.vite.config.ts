import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

// package.json에 "type": "module"을 두지 않는다: sandbox: true인 preload는 ESM으로 실행할 수 없어
// main/preload를 CommonJS로 번들해야 한다(docs/verified-facts.md 참고).
export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    plugins: [react()],
  },
})
