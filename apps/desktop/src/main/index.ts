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
import {
  applyDevUserData,
  devPickedFile,
  maybeCaptureAndQuit,
  maybeCaptureMini,
} from './devCapture'
import { bus } from './events'
import { createHandlers } from './ipc/handlers'
import { registerIpc } from './ipc/register'
import { devServerUrl, isAppUrl, rendererIndexPath } from './security'
import { TimerService } from './timer/timerService'
import { PHASE_LABEL } from '../shared/pomodoro'
import { isFocusing } from '../shared/timer'
import { DEFAULT_POMODORO, type MiniTimerPrefs } from '@kkumikkumi/schema'
import {
  BOARD_RATIO,
  fitWindowBounds,
  MIN_BOARD_WIDTH,
  placeMiniWindow,
  TITLE_BAR_HEIGHT,
  windowSizeForBoard,
} from './window/geometry'

// userData 폴더를 내부 식별자로 고정한다(패키지 이름이나 표시 이름에 의존하지 않도록). ready 전에 설정해야 한다.
app.setName(APP_DISPLAY_NAME)
app.setPath('userData', join(app.getPath('appData'), APP_INTERNAL_NAME))
applyDevUserData()

let core: AppCore | null = null
let timer: TimerService | null = null
let boardWin: BrowserWindow | null = null
let miniWin: BrowserWindow | null = null
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
  const win = boardWin ?? (core ? createBoardWindow() : null)
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
    webPreferences: secureWebPreferences(),
  })
  boardWin = win
  win.on('closed', () => {
    if (boardWin === win) boardWin = null
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

  loadApp(win)
  return win
}

/** 모든 창에 같은 보안 설정(CLAUDE.md 보안 규칙) */
function secureWebPreferences(): Electron.WebPreferences {
  return {
    preload: join(__dirname, '../preload/index.js'),
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    webSecurity: true,
    webviewTag: false,
  }
}

/** 같은 renderer를 싣고, 해시로 화면을 고른다(#mini = 미니 타이머) */
function loadApp(win: BrowserWindow, hash?: string): void {
  if (devServerUrl) void win.loadURL(hash ? `${devServerUrl}#${hash}` : devServerUrl)
  else void win.loadFile(rendererIndexPath, hash ? { hash } : {})
}

/** 미니 타이머 창: 작은 frameless 창. 타이머 상태는 main 하나라 모든 창이 같은 값을 받는다. */
function openMiniTimer(): void {
  if (miniWin && !miniWin.isDestroyed()) {
    miniWin.show()
    miniWin.focus()
    return
  }
  const prefs = core?.repos.settings.miniTimer() ?? { alwaysOnTop: true }
  const bounds = placeMiniWindow(
    core?.repos.miniWindowState.get() ?? null,
    screen.getAllDisplays().map((d) => d.workArea),
    screen.getPrimaryDisplay().workArea,
  )
  const win = new BrowserWindow({
    ...bounds,
    useContentSize: true,
    show: false,
    frame: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    title: `${APP_DISPLAY_NAME} 타이머`,
    backgroundColor: '#ffffff',
    webPreferences: secureWebPreferences(),
  })
  miniWin = win
  applyMiniPrefs(prefs)
  win.once('ready-to-show', () => win.show())
  let saveTimer: NodeJS.Timeout | undefined
  const savePos = () => {
    if (win.isDestroyed()) return
    const b = win.getContentBounds()
    core?.repos.miniWindowState.save({ x: b.x, y: b.y, width: b.width, height: b.height })
  }
  win.on('move', () => {
    clearTimeout(saveTimer)
    saveTimer = setTimeout(savePos, 500)
  })
  win.on('close', () => {
    clearTimeout(saveTimer)
    savePos()
  })
  win.on('closed', () => {
    if (miniWin === win) miniWin = null
  })
  maybeCaptureMini(win)
  loadApp(win, 'mini')
}

function applyMiniPrefs(p: MiniTimerPrefs): void {
  if (!miniWin || miniWin.isDestroyed()) return
  // floating: 일반 창 위, 시스템 메뉴/알림 아래. 풀스크린/다른 Space 위 표시(U2)는 범위 밖.
  miniWin.setAlwaysOnTop(p.alwaysOnTop, 'floating')
}

/** 파일 선택 → 바이트. 경로는 main 안에서만 다루고 renderer로 보내지 않는다. */
async function pickImageFile(purpose: 'image' | 'pet'): Promise<Uint8Array | null> {
  const dev = devPickedFile()
  if (dev) return new Uint8Array(await readFile(dev))
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
      miniTimer: {
        open: openMiniTimer,
        close: () => miniWin?.close(),
        apply: applyMiniPrefs,
      },
    }),
  )

  createBoardWindow()
  app.on('activate', () => {
    // 미니 창만 남아 있어도 Dock을 누르면 보드 창을 다시 연다
    if (!boardWin) createBoardWindow()
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

function timerDoneText(info: TimerDoneInfo): { title: string; body: string } {
  const base = TIMER_DONE_TEXT[info.mode]
  if (!info.next) return base
  const next = PHASE_LABEL[info.next.phase]
  return {
    title: base.title,
    body: info.next.started ? `${next} 시간이 시작됐어요.` : `다음은 ${next} 차례예요.`,
  }
}

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
      if (Notification.isSupported()) new Notification(timerDoneText(info)).show()
    },
    pomodoro: () => {
      try {
        return c.repos.settings.pomodoro()
      } catch {
        return DEFAULT_POMODORO
      }
    },
    onSession: (s) => {
      try {
        c.repos.timerSessions.insert({ ...s, id: randomUUID() })
      } catch {
        // 기록 실패가 타이머를 멈추게 하지 않는다(로그에 사용자 데이터 없음)
        console.error('[timer] 기록 저장 실패')
      }
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
