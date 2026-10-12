import { randomUUID } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { app, BrowserWindow, dialog, type WebContents } from 'electron'
import { APP_DISPLAY_NAME, APP_INTERNAL_NAME } from '../shared/identity'
import { AssetError, DEFAULT_PIPELINE_OPTIONS } from './assets/pipeline'
import { bootstrap, type AppCore } from './bootstrap'
import { createHandlers } from './ipc/handlers'
import { registerIpc } from './ipc/register'
import { devServerUrl, isAppUrl, rendererIndexPath } from './security'

// userData 폴더를 내부 식별자로 고정한다(패키지 이름이나 표시 이름에 의존하지 않도록). ready 전에 설정해야 한다.
app.setName(APP_DISPLAY_NAME)
app.setPath('userData', join(app.getPath('appData'), APP_INTERNAL_NAME))

let core: AppCore | null = null

// DB와 테마 파일을 한 프로세스만 쓰도록 단일 인스턴스로 제한한다.
const isPrimary = app.requestSingleInstanceLock()
if (!isPrimary) app.quit()
app.on('second-instance', () => {
  const win = BrowserWindow.getAllWindows()[0] ?? (core ? createBoardWindow() : null)
  if (win?.isMinimized()) win.restore()
  win?.focus()
})

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
    title: APP_DISPLAY_NAME,
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
    void win.loadFile(rendererIndexPath)
  }
  return win
}

/** 파일 선택 → 바이트. 경로는 main 안에서만 다루고 renderer로 보내지 않는다. */
async function pickImageFile(purpose: 'image' | 'pet'): Promise<Uint8Array | null> {
  const parent = BrowserWindow.getFocusedWindow()
  const options: Electron.OpenDialogOptions = {
    properties: ['openFile'],
    filters: [
      purpose === 'pet'
        ? { name: 'PNG', extensions: ['png'] }
        : { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] },
    ],
  }
  const res = parent
    ? await dialog.showOpenDialog(parent, options)
    : await dialog.showOpenDialog(options)
  const path = res.canceled ? undefined : res.filePaths[0]
  if (!path) return null
  const st = await stat(path)
  // 확장자 필터는 편의일 뿐이다. 실제 형식은 파이프라인이 내용으로 판별한다.
  if (!st.isFile()) throw new AssetError('unsupported_format')
  if (st.size > DEFAULT_PIPELINE_OPTIONS.maxInputBytes) throw new AssetError('too_large_input') // 읽기 전에 거부
  return new Uint8Array(await readFile(path))
}

app.on('web-contents-created', (_event, contents) => hardenWebContents(contents))

void app.whenReady().then(async () => {
  if (!isPrimary) return
  try {
    core = await bootstrap({
      userDataDir: app.getPath('userData'),
      now: Date.now,
      newId: randomUUID,
      defaultThemeName: '기본',
      defaultListName: '할 일',
    })
  } catch (err) {
    console.error(`[boot] ${err instanceof Error ? err.name : 'error'}`)
    dialog.showErrorBox(APP_DISPLAY_NAME, '데이터를 여는 중 문제가 생겼습니다. 앱을 종료합니다.')
    app.quit()
    return
  }
  registerIpc(createHandlers({ ...core, now: Date.now, newId: randomUUID, pickImageFile }))

  createBoardWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createBoardWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', () => {
  core?.db.close()
  core = null
})
