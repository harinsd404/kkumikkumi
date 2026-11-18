import { app, BrowserWindow, ipcMain, screen } from 'electron'
import { APP_DISPLAY_NAME } from '../../shared/identity'
import type { AppCore } from '../bootstrap'
import { maybeCaptureAndQuit } from '../devCapture'
import { isTrustedFrame, secureWebPreferences } from '../security'
import { loadApp, persistBounds } from './appWindow'
import { adaptBoardToDisplays } from './displayFit'
import { fitWindowBounds, MIN_BOARD_WIDTH, windowSizeForBoard } from './geometry'

let boardWin: BrowserWindow | null = null
let quitting = false
/** webContents id → 닫기 진행 함수 */
const closeWaiters = new Map<number, () => void>()

/** 열려 있는 보드 창(없으면 null) */
export const boardWindow = (): BrowserWindow | null => boardWin

/** 닫기 전 저장 마무리 신호(renderer → app:close-ready)와 종료 중 여부. ready 전에 한 번 등록한다. */
export function registerCloseHandshake(): void {
  app.on('before-quit', () => {
    quitting = true
  })
  ipcMain.on('app:close-ready', (e) => {
    if (!isTrustedFrame(e.senderFrame)) return
    closeWaiters.get(e.sender.id)?.()
  })
}

export function createBoardWindow(getCore: () => AppCore | null): BrowserWindow {
  const saved = getCore()?.repos.windowState.get() ?? null
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
    // 이전 저장값은 콘텐츠 크기, 새 저장값은 일반 상태의 창 경계로 복원한다.
    useContentSize: saved?.maximized === undefined,
    show: false,
    title: APP_DISPLAY_NAME,
    // 타이틀바는 앱이 그린다(보드 위 36px). 신호등 버튼은 시스템 것을 쓰고 위치만 맞춘다.
    ...(process.platform === 'darwin'
      ? { titleBarStyle: 'hiddenInset' as const, trafficLightPosition: { x: 14, y: 12 } }
      : { titleBarStyle: 'default' as const, autoHideMenuBar: true }),
    backgroundColor: '#ffffff',
    webPreferences: secureWebPreferences(),
  })
  boardWin = win
  win.on('closed', () => {
    if (boardWin === win) boardWin = null
  })
  // 보드만 렌더러에서 균일 축소한다. 창에 비율 제한을 걸면 16:9 모니터에 틈이 남는다.
  adaptBoardToDisplays(win, screen)
  win.once('ready-to-show', () => {
    if (saved?.maximized) win.maximize()
    win.show()
  })
  maybeCaptureAndQuit(win)

  const flushBounds = persistBounds(win, {
    resize: true,
    normalBounds: true,
    save: (b) => getCore()?.repos.windowState.save(b),
    skip: () => win.isFullScreen() || win.isMinimized(),
  })
  // 닫기 전에 renderer에 저장 마무리 기회를 준다(편집 중 자동 저장 디바운스 대기분).
  let closeReady = false
  win.on('close', (e) => {
    flushBounds()
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
