// 우리 앱 페이지 URL 판정(순수 함수, electron 없이 테스트한다).

/** file:// 경로 비교용: 퍼센트 인코딩을 풀고 유니코드를 NFC로 맞춘다(한글 앱 경로의 NFC/NFD 차이 대비). */
const normPath = (pathname: string): string => {
  try {
    return decodeURIComponent(pathname).normalize('NFC')
  } catch {
    return pathname
  }
}

/**
 * 우리 앱 페이지 URL인지. 문자열 접두사가 아니라 URL을 파싱해 비교한다.
 * - dev(devServerUrl 있음): 개발 서버와 같은 origin
 * - prod: 번들된 index.html 파일 자체(다른 file:// 경로는 거부)
 */
export function isAppUrlFor(url: string, rendererIndexUrl: URL, devServerUrl?: string): boolean {
  try {
    const parsed = new URL(url)
    if (devServerUrl) return parsed.origin === new URL(devServerUrl).origin
    return (
      parsed.protocol === 'file:' &&
      parsed.host === rendererIndexUrl.host &&
      normPath(parsed.pathname) === normPath(rendererIndexUrl.pathname)
    )
  } catch {
    return false
  }
}

/** 개발 서버 주소. 패키지된 앱에서는 환경변수가 있어도 쓰지 않는다(원격 페이지에 IPC가 열리는 것을 막는다). */
export const devServerUrlFor = (
  env: Record<string, string | undefined>,
  packaged: boolean,
): string | undefined => (packaged ? undefined : env['ELECTRON_RENDERER_URL'] || undefined)
