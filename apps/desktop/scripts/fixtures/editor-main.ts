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
      'handle click must not resize',
    )
    await drag(start, { x: start.x - 100, y: start.y + 10 })
    let image = await js('window.editor.theme.blocks[0]')
    assert.equal(image.type, 'image')
    assert.deepEqual(image.span, { w: 7, h: 1 }, 'scaled drag snaps to whole cells')
    assert.equal(await js('window.editor.theme.freeItems.length'), 0, 'image remains a grid block')
    assert.equal(await js('window.editor.selection.kind'), 'block')
    await js('window.editor.undo()')
    await pause()
    assert.equal(
      await js('JSON.stringify(window.editor.theme)'),
      original,
      'one undo restores the grid layout',
    )
    await js('window.editor.redo()')
    await pause()
    const beforeInvalid = await js('JSON.stringify(window.editor.theme)')
    const again = await handle()
    await drag(again, { x: 799, y: 490 })
    assert.equal(
      await js('JSON.stringify(window.editor.theme)'),
      beforeInvalid,
      'collision failure preserves layout',
    )
    const number = async (index: number, value: number) => {
      await js(`(() => {
        const input = document.querySelectorAll('input[type="number"]')[${index}];
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '${value}');
        input.dispatchEvent(new Event('input', { bubbles: true }));
      })()`)
      await pause()
      await js(
        `document.querySelectorAll('input[type="number"]')[${index}].dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))`,
      )
      await pause()
    }
    await number(0, 3)
    await number(1, 2)
    image = await js('window.editor.theme.blocks[0]')
    assert.deepEqual(image.span, { w: 3, h: 2 }, 'inspector accepts cell counts')
    assert.equal(await js('window.editor.theme.freeItems.length'), 0)
    assert.equal(await js('window.editor.flush()'), true)
    const persisted = await js('JSON.stringify(window.saved())')
    await js('window.reload()')
    await pause()
    assert.equal(
      await js('JSON.stringify(window.editor.theme)'),
      persisted,
      'grid cell size survives save and reopen',
    )
    await js(`(() => {
      const ed = window.editor;
      const source = ed.theme.blocks[0];
      ed.dispatch({ type: 'free/add', item: {
        id: '00000000-0000-7000-8000-000000000099', kind: 'image',
        x: 1206.25, y: 805, w: 368.75, h: 170, rotation: 0, z: 0,
        layer: 'front', locked: false,
        decor: { opacity: 1, radius: 15, border: { width: 0, color: null }, shadow: 'none' },
        content: source.props,
      } });
      ed.select({ kind: 'free', id: '00000000-0000-7000-8000-000000000099' });
    })()`)
    await pause()
    await js(
      `[...document.querySelectorAll('button')].find(b => b.textContent === '블록 칸에 맞추기').click()`,
    )
    await pause()
    assert.equal(await js('window.editor.selection.kind'), 'block')
    assert.equal(await js('window.editor.theme.freeItems.length'), 0)
    assert.equal(await js('window.editor.flush()'), true)
    await js('window.editor.undo()')
    await pause()
    assert.equal(
      await js('window.editor.selection.kind'),
      'free',
      'conversion undo keeps selection',
    )
    console.log(
      'PASS: image grid handles, cell snapping, collision rejection, undo/redo, cell count input, save/reopen',
    )
    win.destroy()
    app.quit()
  })
  .catch((error) => {
    console.error(error)
    app.exit(1)
  })
