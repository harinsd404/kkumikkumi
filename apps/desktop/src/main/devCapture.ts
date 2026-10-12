import { writeFile } from 'node:fs/promises'
import { app, type BrowserWindow } from 'electron'

/**
 * 개발용(패키징된 앱에서는 무시): 화면 확인을 자동화하기 위한 훅.
 * - KKUMI_DEV_USER_DATA: userData 폴더를 바꾼다(실제 사용자 데이터를 건드리지 않고 실행)
 * - KKUMI_DEV_CAPTURE: 첫 로드 후 페이지를 PNG로 저장하고 종료한다
 * - KKUMI_DEV_CAPTURE_JS: 캡처 전에 페이지에서 실행할 스크립트(편집 모드 화면 확인 등)
 * - KKUMI_DEV_CLOSE_AFTER_JS=1: 스크립트 직후 캡처 대신 win.close()(빨간 버튼과 같은 경로, 닫기 전 저장 확인용)
 */
export function applyDevUserData(): void {
  const dir = process.env['KKUMI_DEV_USER_DATA']
  if (!app.isPackaged && dir) app.setPath('userData', dir)
}

export function maybeCaptureAndQuit(win: BrowserWindow): void {
  const out = process.env['KKUMI_DEV_CAPTURE']
  if (app.isPackaged || !out) return
  // 다른 창 뒤에 있으면 Chromium이 다시 그리지 않아 캡처가 이전 프레임이 된다
  win.webContents.setBackgroundThrottling(false)
  win.webContents.once('did-finish-load', () => {
    win.focus()
    setTimeout(() => {
      const js = process.env['KKUMI_DEV_CAPTURE_JS']
      const closeAfter = process.env['KKUMI_DEV_CLOSE_AFTER_JS'] === '1'
      void (js ? win.webContents.executeJavaScript(js).catch(() => {}) : Promise.resolve())
        .then(async () => {
          if (closeAfter) return win.close()
          await new Promise((r) => setTimeout(r, 800))
          if (win.isDestroyed()) return
          const img = await win.webContents.capturePage()
          await writeFile(out, img.toPNG())
        })
        .catch(() => {})
        .finally(() => app.quit())
    }, 2500)
  })
}
