import galmuriLicense from 'galmuri/ofl.md?url'
import galmuri11Bold from 'galmuri/dist/Galmuri11-Bold.woff2?url'
import galmuri11Regular from 'galmuri/dist/Galmuri11.woff2?url'
import pretendardLicense from 'pretendard/dist/LICENSE.txt?url'
import pretendardBold from 'pretendard/dist/web/static/woff2/Pretendard-Bold.woff2?url'
import pretendardMedium from 'pretendard/dist/web/static/woff2/Pretendard-Medium.woff2?url'
import pretendardRegular from 'pretendard/dist/web/static/woff2/Pretendard-Regular.woff2?url'
import pretendardSemiBold from 'pretendard/dist/web/static/woff2/Pretendard-SemiBold.woff2?url'

/**
 * 번들 폰트 레지스트리. 테마에는 fontId만 저장하고, 모르는 ID는 기본 폰트로 대체한다.
 * 파일은 공식 배포본을 수정 없이 사용한다(라이선스: docs/fonts.md).
 */
export const DEFAULT_FONT_ID = 'pretendard'

interface FontEntry {
  label: string
  family: string
  /** OFL: 폰트와 함께 라이선스 원문을 배포한다(빌드 산출물에 포함됨) */
  licenseUrl: string
  faces: readonly { weight: number; url: string }[]
}

export const FONTS: Readonly<Record<string, FontEntry>> = {
  pretendard: {
    label: 'Pretendard',
    family: 'Pretendard',
    licenseUrl: pretendardLicense,
    faces: [
      { weight: 400, url: pretendardRegular },
      { weight: 500, url: pretendardMedium },
      { weight: 600, url: pretendardSemiBold },
      { weight: 700, url: pretendardBold },
    ],
  },
  galmuri11: {
    label: '갈무리11',
    family: 'Galmuri11',
    licenseUrl: galmuriLicense,
    faces: [
      { weight: 400, url: galmuri11Regular },
      { weight: 700, url: galmuri11Bold },
    ],
  },
}

export const resolveFontId = (id: string): string =>
  Object.hasOwn(FONTS, id) ? id : DEFAULT_FONT_ID

/** CSS font-family 값. 모르는 ID는 기본 폰트. */
export function fontStack(id: string): string {
  const f = FONTS[resolveFontId(id)]!
  return `"${f.family}", "Pretendard", system-ui, sans-serif`
}

let loaded = false
/** FontFace API로 번들 폰트를 등록한다(외부 CSS/URL 없음, CSP font-src 'self'). */
export function registerBundledFonts(): void {
  if (loaded || typeof document === 'undefined') return
  loaded = true
  for (const f of Object.values(FONTS)) {
    for (const face of f.faces) {
      const ff = new FontFace(f.family, `url("${face.url}") format("woff2")`, {
        weight: String(face.weight),
        display: 'swap',
      })
      document.fonts.add(ff)
      void ff.load().catch(() => {})
    }
  }
}
