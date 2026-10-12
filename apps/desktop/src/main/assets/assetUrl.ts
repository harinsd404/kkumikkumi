// 렌더러가 테마 에셋을 표시할 때 쓰는 커스텀 스킴. 형식: kkumi-asset://<themeId>/<sha256>.<png|jpg|webp>
export const ASSET_SCHEME = 'kkumi-asset'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const FILE_RE = /^\/([0-9a-f]{64})\.(png|jpg|webp)$/

export const MIME_BY_EXT = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' } as const

export interface ParsedAssetUrl {
  themeId: string
  hash: string
  ext: keyof typeof MIME_BY_EXT
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
  if (!UUID_RE.test(u.hostname)) return null
  const m = FILE_RE.exec(u.pathname)
  if (!m) return null
  return { themeId: u.hostname, hash: m[1]!, ext: m[2] as ParsedAssetUrl['ext'] }
}
