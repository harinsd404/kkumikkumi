import type { Theme } from '@kkumikkumi/schema'

const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' } as const

/** main의 kkumi-asset 프로토콜 URL. 매니페스트에 없는 해시는 null. */
export function makeAssetUrl(theme: Theme): (hash: string) => string | null {
  const byHash = new Map(theme.assets.map((a) => [a.hash, a]))
  return (hash) => {
    const a = byHash.get(hash)
    return a ? `kkumi-asset://${theme.id.toLowerCase()}/${a.hash}.${EXT[a.mime]}` : null
  }
}
