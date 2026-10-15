import { ASSET_EXT_BY_MIME, type Asset, type Theme } from '@kkumikkumi/schema'

/** 에셋 파일 하나의 URL(매니페스트에 넣기 전 미리보기용) */
export const assetFileUrl = (themeId: string, a: Pick<Asset, 'hash' | 'mime'>) =>
  `kkumi-asset://${themeId.toLowerCase()}/${a.hash}.${ASSET_EXT_BY_MIME[a.mime]}`

/** main의 kkumi-asset 프로토콜 URL. 매니페스트에 없는 해시는 null. */
export function makeAssetUrl(theme: Theme): (hash: string) => string | null {
  const byHash = new Map(theme.assets.map((a) => [a.hash, a]))
  return (hash) => {
    const a = byHash.get(hash)
    return a ? assetFileUrl(theme.id, a) : null
  }
}
