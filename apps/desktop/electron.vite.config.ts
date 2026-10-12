import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

// package.json에 "type": "module"을 두지 않는다: sandbox: true인 preload는 ESM으로 실행할 수 없어
// main/preload를 CommonJS로 번들해야 한다(docs/verified-facts.md 참고).
export default defineConfig({
  main: {
    build: {
      // 워크스페이스 스키마 패키지는 .ts 소스를 export하므로 번들에 포함한다. zod도 함께 번들.
      // sharp는 네이티브 모듈이라 외부로 둔다(기본 동작: dependencies는 external).
      externalizeDeps: { exclude: ['@kkumikkumi/schema', 'zod'] },
    },
  },
  preload: {
    // sandbox preload는 require가 electron/events/timers/url로 제한되므로 전부 번들한다.
    build: { externalizeDeps: false },
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    plugins: [react()],
  },
})
