import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

// 개발 서버 주소(electron-vite dev가 설정). 프로덕션에서는 undefined이고 file://로 로드한다.
export const devServerUrl = process.env['ELECTRON_RENDERER_URL']

/** 프로덕션 렌더러 파일 경로 (out/main 기준) */
export const rendererIndexPath = join(__dirname, '../renderer/index.html')
const rendererIndexUrl = pathToFileURL(rendererIndexPath)

/**
 * 우리 앱 페이지 URL인지. 문자열 접두사가 아니라 URL을 파싱해 비교한다.
 * - dev: 개발 서버와 같은 origin
 * - prod: 번들된 index.html 파일 자체(다른 file:// 경로는 거부)
 */
export function isAppUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    if (devServerUrl) return parsed.origin === new URL(devServerUrl).origin
    return parsed.protocol === 'file:' && parsed.pathname === rendererIndexUrl.pathname
  } catch {
    return false
  }
}
