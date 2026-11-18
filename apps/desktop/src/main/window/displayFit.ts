import type { BrowserWindow, Screen } from 'electron'
import { fitWindowBounds, MIN_BOARD_WIDTH, windowSizeForBoard, windowWorkArea } from './geometry'

/** 모니터 교체/배율 변경 후 OS의 창 이동이 끝나면 새 작업 영역에 맞춘다. */
export function adaptBoardToDisplays(win: BrowserWindow, screen: Screen): void {
  let timer: NodeJS.Timeout | undefined
  const fit = () => {
    if (win.isDestroyed() || win.isFullScreen() || win.isMinimized()) return
    const areas = screen.getAllDisplays().map((d) => d.workArea)
    const primary = screen.getPrimaryDisplay().workArea
    const current = win.getBounds()
    const area = windowWorkArea(current, areas, primary)
    const min = windowSizeForBoard(MIN_BOARD_WIDTH)
    win.setMinimumSize(Math.min(min.width, area.width), Math.min(min.height, area.height))
    if (win.isMaximized()) {
      // OS가 보통 처리하지만 모니터/배율 전환 후 이전 크기가 남으면 다시 최대화한다.
      // Windows의 보이지 않는 프레임은 작업 영역 밖으로 몇 px 뻗을 수 있다.
      const content = win.getContentBounds()
      const covers =
        current.x <= area.x &&
        current.y <= area.y &&
        current.x + current.width >= area.x + area.width &&
        current.y + current.height >= area.y + area.height &&
        current.width <= area.width + Math.max(0, current.width - content.width) &&
        current.height <= area.height + Math.max(0, current.height - content.height)
      if (!covers) {
        const normal = fitWindowBounds(win.getNormalBounds(), [area], area)
        win.unmaximize()
        win.setBounds(normal)
        win.maximize()
      }
      return
    }
    const next = fitWindowBounds(current, areas, primary)
    if (
      next.x !== current.x ||
      next.y !== current.y ||
      next.width !== current.width ||
      next.height !== current.height
    )
      win.setBounds(next)
  }
  const schedule = () => {
    clearTimeout(timer)
    timer = setTimeout(fit, 200)
  }
  screen.on('display-added', schedule)
  screen.on('display-removed', schedule)
  screen.on('display-metrics-changed', schedule)
  win.on('restore', schedule)
  win.on('unmaximize', schedule)
  win.on('leave-full-screen', schedule)
  win.once('closed', () => {
    clearTimeout(timer)
    screen.removeListener('display-added', schedule)
    screen.removeListener('display-removed', schedule)
    screen.removeListener('display-metrics-changed', schedule)
    win.removeListener('restore', schedule)
    win.removeListener('unmaximize', schedule)
    win.removeListener('leave-full-screen', schedule)
  })
  fit()
}
