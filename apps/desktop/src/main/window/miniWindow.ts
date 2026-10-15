import type { MiniTimerPrefs } from '@kkumikkumi/schema'
import { BrowserWindow, screen } from 'electron'
import { APP_DISPLAY_NAME } from '../../shared/identity'
import type { AppCore } from '../bootstrap'
import { maybeCaptureMini } from '../devCapture'
import { secureWebPreferences } from '../security'
import { loadApp, persistBounds } from './appWindow'
import { placeMiniWindow } from './geometry'

let miniWin: BrowserWindow | null = null

/** 미니 타이머 창: 작은 frameless 창. 타이머 상태는 main 하나라 모든 창이 같은 값을 받는다. */
export function openMiniTimer(getCore: () => AppCore | null): void {
  if (miniWin && !miniWin.isDestroyed()) {
    miniWin.show()
    miniWin.focus()
    return
  }
  const core = getCore()
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
  const flushBounds = persistBounds(win, {
    resize: false,
    save: (b) => getCore()?.repos.miniWindowState.save(b),
  })
  win.on('close', flushBounds)
  win.on('closed', () => {
    if (miniWin === win) miniWin = null
  })
  maybeCaptureMini(win)
  loadApp(win, 'mini')
}

export function closeMiniTimer(): void {
  miniWin?.close()
}

export function applyMiniPrefs(p: MiniTimerPrefs): void {
  if (!miniWin || miniWin.isDestroyed()) return
  // floating: 일반 창 위, 시스템 메뉴/알림 아래. 풀스크린/다른 Space 위 표시(U2)는 범위 밖.
  miniWin.setAlwaysOnTop(p.alwaysOnTop, 'floating')
}
