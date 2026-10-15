import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { app, type WebContents, type WebFrameMain } from 'electron'
import { devServerUrlFor, isAppUrlFor } from './appUrl'

// 개발 서버 주소(electron-vite dev가 설정). 프로덕션에서는 undefined이고 file://로 로드한다.
export const devServerUrl = devServerUrlFor(process.env, app.isPackaged)

/** 프로덕션 렌더러 파일 경로 (out/main 기준) */
export const rendererIndexPath = join(__dirname, '../renderer/index.html')
const rendererIndexUrl = pathToFileURL(rendererIndexPath)

export const isAppUrl = (url: string): boolean => isAppUrlFor(url, rendererIndexUrl, devServerUrl)

/** 우리 앱 페이지의 메인 프레임인지(IPC 발신자 확인) */
export const isTrustedFrame = (frame: WebFrameMain | null | undefined): boolean =>
  !!frame && frame.parent === null && isAppUrl(frame.url)

// 모든 webContents에 탐색/새 창 차단을 적용한다.
export function hardenWebContents(contents: WebContents): void {
  contents.on('will-navigate', (event) => {
    if (!isAppUrl(event.url)) event.preventDefault()
  })
  contents.on('will-redirect', (event) => {
    if (!isAppUrl(event.url)) event.preventDefault()
  })
  // 외부 링크는 지금은 열지 않는다. 필요해지면 허용 목록 + shell.openExternal로 처리한다.
  contents.setWindowOpenHandler(() => ({ action: 'deny' }))
  contents.on('will-attach-webview', (event) => {
    event.preventDefault()
  })
}

/** 모든 창에 같은 보안 설정(CLAUDE.md 보안 규칙) */
export function secureWebPreferences(): Electron.WebPreferences {
  return {
    preload: join(__dirname, '../preload/index.js'),
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    webSecurity: true,
    webviewTag: false,
  }
}
