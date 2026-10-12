import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'

// dev에서는 Vite가 <style>을 주입하므로 style-src 'unsafe-inline'이 필요하다. 빌드 결과물에서는 제거한다
// (React의 style 속성은 CSSOM으로 적용되어 CSP 대상이 아님).
const strictCspInBuild = (): Plugin => ({
  name: 'kkumi-strict-csp',
  apply: 'build',
  transformIndexHtml(html) {
    const out = html.replace("style-src 'self' 'unsafe-inline'", "style-src 'self'")
    if (out === html) throw new Error('CSP style-src 치환 대상이 없음')
    return out
  },
})

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
    plugins: [react(), strictCspInBuild()],
  },
})
