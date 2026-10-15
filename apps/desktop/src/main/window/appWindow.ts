import type { WindowState } from '@kkumikkumi/schema'
import type { BrowserWindow } from 'electron'
import { devServerUrl, rendererIndexPath } from '../security'

/** 같은 renderer를 싣고, 해시로 화면을 고른다(#mini = 미니 타이머) */
export function loadApp(win: BrowserWindow, hash?: string): void {
  if (devServerUrl) void win.loadURL(hash ? `${devServerUrl}#${hash}` : devServerUrl)
  else void win.loadFile(rendererIndexPath, hash ? { hash } : {})
}

/**
 * 창 위치(resize면 크기도)가 바뀔 때마다 0.5초 디바운스로 저장한다. skip()이 참이면(전체 화면 등) 저장하지 않는다.
 * 돌려주는 flush는 대기분을 취소하고 바로 저장한다(창을 닫을 때).
 */
export function persistBounds(
  win: BrowserWindow,
  o: { resize: boolean; save(b: WindowState): void; skip?(): boolean },
): () => void {
  let saveTimer: NodeJS.Timeout | undefined
  const saveNow = () => {
    if (win.isDestroyed() || o.skip?.()) return
    const b = win.getContentBounds()
    o.save({ x: b.x, y: b.y, width: b.width, height: b.height })
  }
  const schedule = () => {
    clearTimeout(saveTimer)
    saveTimer = setTimeout(saveNow, 500)
  }
  if (o.resize) win.on('resize', schedule)
  win.on('move', schedule)
  return () => {
    clearTimeout(saveTimer)
    saveNow()
  }
}
