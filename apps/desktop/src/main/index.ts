import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { app, dialog } from 'electron'
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

// userData 폴더를 내부 식별자로 고정한다(패키지 이름이나 표시 이름에 의존하지 않도록). ready 전에 설정해야 한다.
app.setName(APP_DISPLAY_NAME)
app.setPath('userData', join(app.getPath('appData'), APP_INTERNAL_NAME))
applyDevUserData()

let core: AppCore | null = null
let timer: TimerService | null = null
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
      takeMissedTimerDone,
      onTodoCompleted: () => bus.emit('todo:completed'),
      miniTimer: {
        open: () => openMiniTimer(getCore),
        close: closeMiniTimer,
        apply: applyMiniPrefs,
      },
    }),
  )

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
  timer?.dispose()
  timer = null
  core?.db.close()
  core = null
})
