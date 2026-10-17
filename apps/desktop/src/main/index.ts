import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { app, BrowserWindow, dialog } from 'electron'
import { APP_DISPLAY_NAME, APP_INTERNAL_NAME } from '../shared/identity'
import { pickImageFile } from './assets/pickImageFile'
import { handleAssetProtocol, registerAssetScheme } from './assets/protocol'
import { bootstrap, type AppCore } from './bootstrap'
import { applyDevUserData } from './devCapture'
import { bus } from './events'
import { createHandlers } from './ipc/handlers'
import { registerIpc } from './ipc/register'
import { hardenWebContents } from './security'
import type { TimerService } from './timer/timerService'
import { startTimerService, takeMissedTimerDone } from './timer/wiring'
import { boardWindow, createBoardWindow, registerCloseHandshake } from './window/boardWindow'
import { applyMiniPrefs, closeMiniTimer, openMiniTimer } from './window/miniWindow'
import { errorKind, initLog, logError } from './log'
import { setAppMenu } from './menu'
import { createMcpController, type McpController } from './mcp/controller'
import { createMcpServer } from './mcp/tools'

/** 빌드 때 정하는 데이터 폴더 이름(배포 전 시험 빌드만 다르게, 보통은 빈 문자열 → 내부 식별자) */
declare const __KKUMI_DATA_DIR__: string

// userData 폴더를 내부 식별자로 고정한다(패키지 이름이나 표시 이름에 의존하지 않도록). ready 전에 설정해야 한다.
app.setName(APP_DISPLAY_NAME)
app.setPath('userData', join(app.getPath('appData'), __KKUMI_DATA_DIR__ || APP_INTERNAL_NAME))
applyDevUserData()
// 배포본은 원격 디버깅 포트로 열지 않는다(다른 프로그램이 앱 화면·데이터에 붙는 것 방지). 배포 전 시험 빌드만 허용.
if (app.isPackaged && !__KKUMI_DATA_DIR__ && app.commandLine.hasSwitch('remote-debugging-port'))
  app.exit(1)
initLog(app.getPath('logs'))
process.on('uncaughtException', (err) => logError('[main] uncaught', errorKind(err)))
process.on('unhandledRejection', (err) => logError('[main] unhandled rejection', errorKind(err)))
app.on('render-process-gone', (_e, _wc, d) => logError('[renderer] gone', d.reason))
app.on('child-process-gone', (_e, d) => logError(`[${d.type}] gone`, d.reason))

let core: AppCore | null = null
let timer: TimerService | null = null
let mcp: McpController | null = null
const getCore = () => core
registerCloseHandshake()

registerAssetScheme()

// DB와 테마 파일을 한 프로세스만 쓰도록 단일 인스턴스로 제한한다.
const isPrimary = app.requestSingleInstanceLock()
if (!isPrimary) app.quit()
app.on('second-instance', () => {
  const win = boardWindow() ?? (core ? createBoardWindow(getCore) : null)
  if (win?.isMinimized()) win.restore()
  win?.focus()
})

app.on('web-contents-created', (_event, contents) => hardenWebContents(contents))

void app.whenReady().then(async () => {
  if (!isPrimary) return
  setAppMenu({
    openMcpSettings: () => {
      const win = boardWindow() ?? (core ? createBoardWindow(getCore) : null)
      if (!win) return
      win.show()
      win.focus()
      // 새로 만든 창이면 로드가 끝난 뒤 보낸다
      if (win.webContents.isLoading())
        win.webContents.once('did-finish-load', () => win.webContents.send('app:open-mcp'))
      else win.webContents.send('app:open-mcp')
    },
  })
  try {
    core = await bootstrap({
      userDataDir: app.getPath('userData'),
      now: Date.now,
      newId: randomUUID,
      defaultThemeName: '푸딩 아침',
      defaultListName: '할 일',
    })
  } catch (err) {
    logError('[boot]', errorKind(err))
    dialog.showErrorBox(APP_DISPLAY_NAME, '데이터를 여는 중 문제가 생겼습니다. 앱을 종료합니다.')
    app.quit()
    return
  }
  handleAssetProtocol(core.themes)
  timer = startTimerService(core)
  const c = core
  const handlers = createHandlers({
    ...core,
    now: Date.now,
    newId: randomUUID,
    pickImageFile,
    defaultListName: '할 일',
    timer,
    takeMissedTimerDone,
    onTodoCompleted: () => bus.emit('todo:completed'),
    miniTimer: {
      open: () => openMiniTimer(getCore),
      close: closeMiniTimer,
      apply: applyMiniPrefs,
    },
    mcp: {
      status: () => mcp!.status(),
      apply: (mode) => mcp!.apply(mode),
    },
  })
  // 외부 AI 연결(MCP): 앱 IPC와 같은 핸들러를 쓴다. 바뀐 데이터는 열린 창들이 다시 읽는다.
  mcp = createMcpController({
    userDataDir: app.getPath('userData'),
    makeServer: (mode) =>
      createMcpServer({
        handlers,
        mode,
        currentMode: () => mcp?.status().mode ?? 'off',
        now: Date.now,
        version: app.getVersion(),
        changed: (domain) => {
          for (const w of BrowserWindow.getAllWindows())
            if (!w.isDestroyed()) w.webContents.send('data:changed', domain)
        },
      }),
    onError: (tag, err) => logError(tag, errorKind(err)),
  })
  registerIpc(handlers)
  void mcp.apply(c.repos.settings.mcp().mode)

  createBoardWindow(getCore)
  app.on('activate', () => {
    // 미니 창만 남아 있어도 Dock을 누르면 보드 창을 다시 연다
    if (!boardWindow()) createBoardWindow(getCore)
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', () => {
  void mcp?.dispose()
  mcp = null
  timer?.dispose()
  timer = null
  core?.db.close()
  core = null
})
