import { app, BrowserWindow, session } from 'electron'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import assert from 'node:assert/strict'
import { registerAssetScheme, handleAssetProtocol } from '../../src/main/assets/protocol'
import { ThemeStore } from '../../src/main/themes/themeStore'
import { DiaryPhotoStore } from '../../src/main/diary/photoStore'

app.setPath('userData', join(__dirname, 'profile'))
registerAssetScheme()
const hash = 'a'.repeat(64)
const src = `kkumi-asset://diary/${hash}.png`
// Use a valid small fixture, independent of any user's photos.
const validPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jgskAAAAASUVORK5CYII=',
  'base64',
)
writeFileSync(
  join(__dirname, 'index.html'),
  `<html><head><meta http-equiv="Content-Security-Policy" content="default-src 'self'; img-src 'self' kkumi-asset:; script-src 'self'"></head><body><img id="original" src="${src}"><div id="root"></div><script src="renderer.js"></script></body></html>`,
)
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms))
void app
  .whenReady()
  .then(async () => {
    const diary = join(__dirname, 'diary')
    mkdirSync(diary)
    handleAssetProtocol(
      new ThemeStore(join(__dirname, 'themes'), { now: Date.now, newId: randomUUID }),
      new DiaryPhotoStore(diary),
    )
    let errors = 0
    session.defaultSession.webRequest.onCompleted((details) => {
      if (details.url !== src || details.statusCode !== 404) return
      assert.ok(JSON.stringify(details.responseHeaders).includes('no-store'))
      errors++
    })
    const win = new BrowserWindow({
      show: false,
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        webSecurity: true,
        backgroundThrottling: false,
      },
    })
    await win.loadFile(join(__dirname, 'index.html'))
    await pause(150)
    assert.ok(errors > 0, 'fixture must fail before restoration')
    writeFileSync(join(diary, `${hash}.png`), validPng)
    await pause(2200)
    const result = await win.webContents.executeJavaScript(`({
    original: document.getElementById('original').naturalWidth,
    recovered: document.getElementById('recovering').naturalWidth,
    src: document.getElementById('recovering').getAttribute('src')
  })`)
    assert.equal(result.original, 0, 'plain img remains blank after the file returns')
    assert.equal(result.recovered, 1, 'AssetImage must recover without restarting or editing')
    assert.equal(result.src, src, 'asset identity must remain unchanged')
    console.log(
      'PASS: real Electron asset failure, no-store response, file restoration and automatic recovery',
    )
    win.destroy()
    app.quit()
  })
  .catch((error) => {
    console.error(error)
    app.exit(1)
  })
