import { join } from 'node:path'
import { app, BrowserWindow, type WebContents } from 'electron'

// 개발 서버 주소(electron-vite dev가 설정). 프로덕션에서는 undefined이고 file://로 로드한다.
const devServerUrl = process.env['ELECTRON_RENDERER_URL']

function isAppUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    if (devServerUrl) return parsed.origin === new URL(devServerUrl).origin
    return parsed.protocol === 'file:'
  } catch {
    return false
  }
}

// 모든 webContents에 탐색/새 창 차단을 적용한다.
function hardenWebContents(contents: WebContents): void {
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

function createBoardWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1200,
    height: 750,
    show: false,
    title: '꾸미꾸미',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      webviewTag: false,
    },
  })
  win.once('ready-to-show', () => win.show())

  if (devServerUrl) {
    void win.loadURL(devServerUrl)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
  return win
}

app.on('web-contents-created', (_event, contents) => hardenWebContents(contents))

void app.whenReady().then(() => {
  createBoardWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createBoardWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
