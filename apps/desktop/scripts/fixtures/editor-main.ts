import { app, BrowserWindow } from 'electron'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import assert from 'node:assert/strict'

app.setPath('userData', join(__dirname, 'profile'))
writeFileSync(
  join(__dirname, 'index.html'),
  `<html><head>
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'">
<style>
body { margin: 0; } .ke-overlay { position: absolute; inset: 0; }
.ke-hit,.ke-handle { position: absolute; } .ke-handle { background: white; border: 1px solid black; }
.ke-handle--nw { left: 0; top: 0; } .ke-handle--ne { left: 100%; top: 0; }
.ke-handle--sw { left: 0; top: 100%; } .ke-handle--se { left: 100%; top: 100%; }
</style></head><body><div id="root"></div><script src="renderer.js"></script></body></html>`,
)
const pause = () => new Promise((r) => setTimeout(r, 50))
void app
  .whenReady()
  .then(async () => {
    const win = new BrowserWindow({
      show: false,
      width: 1200,
      height: 900,
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: false,
      },
    })
    await win.loadFile(join(__dirname, 'index.html'))
    const js = (code: string) => win.webContents.executeJavaScript(code)
    const click = async (x: number, y: number) => {
      win.webContents.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 })
      win.webContents.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 })
      await pause()
    }
    const drag = async (
      from: { x: number; y: number },
      to: { x: number; y: number },
      shift = false,
    ) => {
      win.webContents.sendInputEvent({ type: 'mouseDown', ...from, button: 'left', clickCount: 1 })
      win.webContents.sendInputEvent({
        type: 'mouseMove',
        ...to,
        modifiers: shift ? ['shift', 'leftButtonDown'] : ['leftButtonDown'],
      })
      await pause()
      win.webContents.sendInputEvent({ type: 'mouseUp', ...to, button: 'left', clickCount: 1 })
      await pause()
    }
    const handle = () =>
      js(`(() => {
    const r = document.querySelector('.is-selected .ke-handle--se').getBoundingClientRect();
    return { x: Math.round(r.x+r.width/2), y: Math.round(r.y+r.height/2) };
  })()`)
    await pause()
    const original = await js('JSON.stringify(window.editor.theme)')
    await click(100, 50)
    assert.equal(
      await js("document.querySelectorAll('.ke-block.is-selected .ke-handle').length"),
      4,
    )
    const start = await handle()
    await click(start.x, start.y)
    assert.equal(
      await js('JSON.stringify(window.editor.theme)'),
      original,
      'handle click must not convert',
    )
    await drag(start, { x: start.x - 100, y: start.y + 40 })
    let image = await js('window.editor.theme.freeItems[0]')
    assert.equal(image.kind, 'image')
    assert.ok(Math.abs(image.w - 1350) <= 3, 'scaled pointer changes widget width')
    assert.ok(Math.abs(image.h - 250) <= 3, 'scaled pointer changes widget height')
    assert.equal(await js('window.editor.selection.kind'), 'free')
    assert.equal(await js("document.querySelectorAll('.ke-free.is-selected .ke-handle').length"), 4)
    await js('window.editor.undo()')
    await pause()
    assert.equal(
      await js('JSON.stringify(window.editor.theme)'),
      original,
      'one undo restores original grid widget',
    )
    assert.equal(await js('window.editor.selection.kind'), 'block')
    await js('window.editor.redo()')
    await pause()
    assert.equal(await js('window.editor.selection.kind'), 'free')
    const ratio = image.w / image.h
    const again = await handle()
    await drag(again, { x: again.x - 70, y: again.y + 150 }, true)
    image = await js('window.editor.theme.freeItems[0]')
    assert.ok(
      Math.abs(image.w / image.h - ratio) < 0.0001,
      'Shift preserves aspect at canvas limits',
    )
    // Exercise the real inspector input and its Enter commit, not just the reducer.
    await js(`(() => {
    const input = [...document.querySelectorAll('input[type="number"]')][2];
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '637');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`)
    await pause()
    await js(
      `document.querySelectorAll('input[type="number"]')[2].dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))`,
    )
    await pause()
    assert.equal(await js('window.editor.theme.freeItems[0].w'), 637)
    assert.equal(await js('window.editor.flush()'), true)
    const persisted = await js('JSON.stringify(window.saved())')
    await js('window.reload()')
    await pause()
    assert.equal(
      await js('JSON.stringify(window.editor.theme)'),
      persisted,
      'arbitrary size survives save and reopen',
    )
    console.log(
      'PASS: image widget handles, scaled drag, single undo/redo, Shift ratio, numeric size, save/reopen',
    )
    win.destroy()
    app.quit()
  })
  .catch((error) => {
    console.error(error)
    app.exit(1)
  })
