import { app, screen, type BrowserWindow } from 'electron'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import assert from 'node:assert/strict'
import type { WindowState } from '@kkumikkumi/schema'
import type { AppCore } from '../../src/main/bootstrap'
import { createBoardWindow } from '../../src/main/window/boardWindow'

app.setPath('userData', join(__dirname, '../profile'))
app.on('window-all-closed', () => {})
mkdirSync(join(__dirname, '../preload'), { recursive: true })
writeFileSync(join(__dirname, '../preload/index.js'), '')
writeFileSync(
  join(__dirname, '../renderer/index.html'),
  `<html><head>
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'">
<link rel="stylesheet" href="index.css"></head>
<body><div id="root"></div><script src="index.js"></script></body></html>`,
)
const pause = (ms = 100) => new Promise((r) => setTimeout(r, ms))
async function until(check: () => boolean | Promise<boolean>) {
  for (let i = 0; i < 50; i++) {
    if (await check()) return
    await pause()
  }
  throw new Error('Window did not reach the expected state')
}
let saved: WindowState | null = null
const core = {
  repos: {
    windowState: {
      get: () => saved,
      save: (b: WindowState) => {
        saved = b
      },
    },
  },
} as AppCore

void app
  .whenReady()
  .then(async () => {
    let win = createBoardWindow(() => core)
    const ready = async () => {
      await until(() => !win.webContents.isLoading())
      await until(() => win.webContents.executeJavaScript("!!document.querySelector('.kb-canvas')"))
    }
    const layout = async (window: BrowserWindow) =>
      window.webContents.executeJavaScript(`(() => {
    const host = document.querySelector('.kb-host');
    const canvas = document.querySelector('.kb-canvas');
    const h = host.getBoundingClientRect(), c = canvas.getBoundingClientRect();
    const m = new DOMMatrix(getComputedStyle(canvas).transform);
    return { width: innerWidth, height: innerHeight, hostW: h.width, hostH: h.height,
      canvasW: c.width, canvasH: c.height, scaleX: m.a, scaleY: m.d,
      hostColor: getComputedStyle(host).backgroundColor };
  })()`)
    await ready()
    const available = screen.getDisplayMatching(win.getBounds()).workArea
    for (const [width, height] of [
      [Math.min(1200, available.width - 40), Math.min(700, available.height - 80)],
      [Math.min(900, available.width - 40), Math.min(900, available.height - 80)],
    ]) {
      win.setContentSize(width!, height!)
      await until(async () => (await layout(win)).width === width)
      await pause()
      const r = await layout(win)
      assert.equal(r.hostW, r.width, 'board host fills the available width')
      assert.equal(r.hostH, r.height - 36, 'board host fills the height below the title bar')
      assert.equal(r.scaleX, r.scaleY, 'photos and text keep their proportions')
      assert.ok(r.canvasW <= r.hostW + 1 && r.canvasH <= r.hostH + 1, 'whole board remains visible')
      assert.notEqual(
        r.hostColor,
        'rgba(0, 0, 0, 0)',
        'unused board margins use the theme background',
      )
    }
    await pause(600)
    const normal = win.getNormalBounds()
    win.maximize()
    await until(() => win.isMaximized())
    await pause(600)
    const area = screen.getDisplayMatching(win.getBounds()).workArea
    const content = win.getContentBounds()
    assert.ok(content.width >= area.width - 2, 'maximized window fills monitor width')
    assert.deepEqual(
      saved,
      { ...normal, maximized: true },
      'save normal bounds plus maximized flag',
    )
    win.destroy()
    win = createBoardWindow(() => core)
    await ready()
    await until(() => win.isMaximized())
    assert.ok(win.getContentBounds().width >= area.width - 2, 'reopened window stays maximized')
    win.unmaximize()
    await until(() => !win.isMaximized())
    await pause(700)
    assert.deepEqual(win.getBounds(), normal, 'restoring returns to the previous free window size')
    assert.equal(saved?.maximized, false)
    console.log(
      'PASS: monitor-width maximize, persisted maximize/restore, wide and square board layout, uniform image scale',
    )
    writeFileSync(join(__dirname, 'passed'), 'ok')
    win.destroy()
    app.quit()
  })
  .catch((error) => {
    console.error(error)
    app.exit(1)
  })
