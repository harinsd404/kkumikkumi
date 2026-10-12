import { randomUUID } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Notification,
  powerMonitor,
  screen,
  type WebContents,
} from 'electron'
import type { TimerDoneInfo } from '../shared/api'
import { APP_DISPLAY_NAME, APP_INTERNAL_NAME } from '../shared/identity'
import { AssetError, DEFAULT_PIPELINE_OPTIONS } from './assets/pipeline'
import { handleAssetProtocol, registerAssetScheme } from './assets/protocol'
import { bootstrap, type AppCore } from './bootstrap'
import { applyDevUserData, maybeCaptureAndQuit } from './devCapture'
import { bus } from './events'
import { createHandlers } from './ipc/handlers'
import { registerIpc } from './ipc/register'
import { devServerUrl, isAppUrl, rendererIndexPath } from './security'
import { TimerService } from './timer/timerService'
import { isFocusing } from '../shared/timer'
import {
  BOARD_RATIO,
  fitWindowBounds,
  MIN_BOARD_WIDTH,
  TITLE_BAR_HEIGHT,
  windowSizeForBoard,
} from './window/geometry'

// userData 폴더를 내부 식별자로 고정한다(패키지 이름이나 표시 이름에 의존하지 않도록). ready 전에 설정해야 한다.
app.setName(APP_DISPLAY_NAME)
app.setPath('userData', join(app.getPath('appData'), APP_INTERNAL_NAME))
applyDevUserData()

let core: AppCore | null = null
let timer: TimerService | null = null
/** 창이 없을 때 끝난 타이머. renderer가 timer.takeMissedDone으로 한 번 꺼내 간다. */
let missedTimerDone: TimerDoneInfo | null = null
let quitting = false
/** webContents id → 닫기 진행 함수 */
const closeWaiters = new Map<number, () => void>()
app.on('before-quit', () => {
  quitting = true
})
ipcMain.on('app:close-ready', (e) => {
  if (!isAppUrl(e.senderFrame?.url ?? '')) return
  closeWaiters.get(e.sender.id)?.()
})

registerAssetScheme()

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
  const saved = core?.repos.windowState.get() ?? null
  const bounds = fitWindowBounds(
    saved,
    screen.getAllDisplays().map((d) => d.workArea),
    screen.getPrimaryDisplay().workArea,
  )
  const min = windowSizeForBoard(MIN_BOARD_WIDTH)
  const win = new BrowserWindow({
    ...bounds,
    minWidth: min.width,
    minHeight: min.height,
    useContentSize: true,
    show: false,
    title: APP_DISPLAY_NAME,
    // 타이틀바는 앱이 그린다(보드 위 36px). 신호등 버튼은 시스템 것을 쓰고 위치만 맞춘다.
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 14, y: 12 },
    backgroundColor: '#ffffff',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      webviewTag: false,
    },
  })
  // extraSize: 콘텐츠 안쪽의 타이틀바 높이. 창-콘텐츠 크기 차이는 API가 이미 반영한다(electron.d.ts).
  win.setAspectRatio(BOARD_RATIO, { width: 0, height: TITLE_BAR_HEIGHT })
  win.once('ready-to-show', () => win.show())
  maybeCaptureAndQuit(win)

  let saveTimer: NodeJS.Timeout | undefined
  const saveBounds = () => {
    if (win.isDestroyed() || win.isFullScreen() || win.isMinimized()) return
    const b = win.getContentBounds()
    core?.repos.windowState.save({ x: b.x, y: b.y, width: b.width, height: b.height })
  }
  const scheduleSave = () => {
    clearTimeout(saveTimer)
    saveTimer = setTimeout(saveBounds, 500)
  }
  win.on('resize', scheduleSave)
  win.on('move', scheduleSave)
  // 닫기 전에 renderer에 저장 마무리 기회를 준다(편집 중 자동 저장 디바운스 대기분).
  let closeReady = false
  win.on('close', (e) => {
    clearTimeout(saveTimer)
    saveBounds()
    if (closeReady || win.webContents.isCrashed()) return
    e.preventDefault()
    const finish = () => {
      if (closeReady) return
      closeReady = true
      closeWaiters.delete(win.webContents.id)
      clearTimeout(fallback)
      win.close()
      if (quitting) app.quit()
    }
    const fallback = setTimeout(finish, 1500)
    closeWaiters.set(win.webContents.id, finish)
    win.webContents.send('app:before-close')
  })

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
      defaultThemeName: '푸딩 아침',
      defaultListName: '오늘의 할 일',
    })
  } catch (err) {
    console.error(`[boot] ${err instanceof Error ? err.name : 'error'}`)
    dialog.showErrorBox(APP_DISPLAY_NAME, '데이터를 여는 중 문제가 생겼습니다. 앱을 종료합니다.')
    app.quit()
    return
  }
  handleAssetProtocol(core.themes)
  timer = startTimerService(core)
  registerIpc(
    createHandlers({
      ...core,
      now: Date.now,
      newId: randomUUID,
      pickImageFile,
      defaultListName: '오늘의 할 일',
      timer,
      takeMissedTimerDone: () => {
        const v = missedTimerDone
        missedTimerDone = null
        return v
      },
      onTodoCompleted: () => bus.emit('todo:completed'),
    }),
  )

  createBoardWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createBoardWindow()
  })
})

const sendToWindows = (channel: string, value: unknown) => {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send(channel, value)
  }
}

const TIMER_DONE_TEXT = {
  focus: { title: '집중 시간이 끝났어요', body: '잠깐 쉬어 가요.' },
  break: { title: '쉬는 시간이 끝났어요', body: '다시 시작해 볼까요?' },
} as const

/** 타이머는 main이 소유한다. 완료 알림은 시스템 알림 + 앱 안 표시(timer:done)를 항상 함께 보낸다. */
function startTimerService(c: AppCore): TimerService {
  let focusing: boolean | null = null
  const svc = new TimerService({
    load: () => {
      try {
        return c.repos.timer.get()
      } catch {
        return null // 손상된 타이머 행은 기본값으로 시작
      }
    },
    save: (s) => c.repos.timer.save(s),
    now: Date.now,
    setTimer: (fn, ms) => setTimeout(fn, ms),
    clearTimer: (h) => clearTimeout(h as NodeJS.Timeout),
    onChange: (s) => {
      bus.emit('timer:changed', s)
      sendToWindows('timer:changed', s)
      const f = isFocusing(s)
      if (f !== focusing) bus.emit('focus:changed', (focusing = f))
    },
    onComplete: (info) => {
      bus.emit('timer:done', info)
      if (BrowserWindow.getAllWindows().length > 0) sendToWindows('timer:done', info)
      else missedTimerDone = info
      // 권한 상태를 조회할 API가 없어 거부 여부는 알 수 없다(docs/verified-facts.md). 앱 안 표시를 병행한다.
      if (Notification.isSupported()) new Notification(TIMER_DONE_TEXT[info.mode]).show()
    },
  })
  svc.init()
  focusing = isFocusing(svc.get())
  bus.emit('focus:changed', focusing)
  powerMonitor.on('resume', () => svc.recheck())
  return svc
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', () => {
  timer?.dispose()
  timer = null
  core?.db.close()
  core = null
})
