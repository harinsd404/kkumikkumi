import { readFile } from 'node:fs/promises'
import { ASSET_MIME_BY_EXT } from '@kkumikkumi/schema'
import { protocol } from 'electron'
import type { ThemeStore } from '../themes/themeStore'
import { ASSET_SCHEME, parseAssetUrl } from './assetUrl'

/** app ready 전에 호출해야 한다. CSP는 우회하지 않는다(bypassCSP 없음). */
export function registerAssetScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: ASSET_SCHEME, privileges: { standard: true, secure: true } },
  ])
}

/** 테마 assets 폴더의 <hash>.<ext> 파일만 읽어 준다. 그 외에는 404. */
export function handleAssetProtocol(themes: ThemeStore): void {
  protocol.handle(ASSET_SCHEME, async (request) => {
    const parsed = parseAssetUrl(request.url)
    if (!parsed || request.method !== 'GET') return new Response(null, { status: 404 })
    const mime = ASSET_MIME_BY_EXT[parsed.ext]
    try {
      const data = await readFile(themes.assetPath(parsed.themeId, { hash: parsed.hash, mime }))
      return new Response(new Uint8Array(data), {
        headers: {
          'content-type': mime,
          // 파일명이 내용 해시라 내용이 바뀌지 않는다
          'cache-control': 'public, max-age=31536000, immutable',
          'x-content-type-options': 'nosniff',
        },
      })
    } catch {
      return new Response(null, { status: 404 })
    }
  })
}
