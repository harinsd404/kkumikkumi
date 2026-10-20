import { ASSET_EXT_BY_MIME, type AssetExt } from '@kkumikkumi/schema'

// 렌더러가 테마 에셋을 표시할 때 쓰는 커스텀 스킴. 형식: kkumi-asset://<themeId>/<sha256>.<png|jpg>
// 일기 사진은 kkumi-asset://diary/<sha256>.<png|jpg>
export const ASSET_SCHEME = 'kkumi-asset'
export const DIARY_HOST = 'diary'

// 스키마의 Uuid는 대소문자를 가리지 않지만 여기서는 소문자만 받는다(테마 폴더 이름과 같게).
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
/** 테마 assets 폴더의 에셋 파일 이름: <sha256>.<ext> (확장자는 저장 형식에서) */
export const ASSET_FILE_RE = new RegExp(
  `^([0-9a-f]{64})\\.(${Object.values(ASSET_EXT_BY_MIME).join('|')})$`,
)

export interface ParsedAssetUrl {
  /** 테마 ID, 일기 사진이면 DIARY_HOST */
  themeId: string
  hash: string
  ext: AssetExt
}

/** 엄격한 파싱. 쿼리/해시/추가 경로/대문자/인코딩된 문자는 모두 거부한다. */
export function parseAssetUrl(raw: string): ParsedAssetUrl | null {
  // URL 파서는 '..'와 퍼센트 인코딩을 정규화해 버리므로, 파싱 전에 원문에서 먼저 거부한다
  if (/[%\\]|\/\.{1,2}(\/|$)/.test(raw)) return null
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return null
  }
  if (u.protocol !== `${ASSET_SCHEME}:`) return null
  if (u.search || u.hash || u.username || u.password || u.port) return null
  if (u.hostname !== DIARY_HOST && !UUID_RE.test(u.hostname)) return null
  const m = u.pathname.startsWith('/') ? ASSET_FILE_RE.exec(u.pathname.slice(1)) : null
  if (!m) return null
  return { themeId: u.hostname, hash: m[1]!, ext: m[2] as AssetExt }
}
