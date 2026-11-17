import { readFile } from 'node:fs/promises'
import { ASSET_MIME_BY_EXT } from '@kkumikkumi/schema'
import { protocol } from 'electron'
import type { DiaryPhotoStore } from '../diary/photoStore'
import type { ThemeStore } from '../themes/themeStore'
import { ASSET_SCHEME, DIARY_HOST, parseAssetUrl } from './assetUrl'
import { logError } from '../log'

const notFound = () => new Response(null, { status: 404, headers: { 'cache-control': 'no-store' } })

/** app ready 전에 호출해야 한다. CSP는 우회하지 않는다(bypassCSP 없음). */
export function registerAssetScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: ASSET_SCHEME, privileges: { standard: true, secure: true } },
  ])
}

/** 테마 assets 폴더(또는 일기 사진 폴더)의 <hash>.<ext> 파일만 읽어 준다. 그 외에는 404. */
export function handleAssetProtocol(themes: ThemeStore, diary: DiaryPhotoStore): void {
  protocol.handle(ASSET_SCHEME, async (request) => {
    const parsed = parseAssetUrl(request.url)
    if (!parsed || request.method !== 'GET') return notFound()
    const mime = ASSET_MIME_BY_EXT[parsed.ext]
    try {
      const file =
        parsed.themeId === DIARY_HOST
          ? diary.path({ hash: parsed.hash, mime })
          : themes.assetPath(parsed.themeId, { hash: parsed.hash, mime })
      const data = await readFile(file)
      return new Response(new Uint8Array(data), {
        headers: {
          'content-type': mime,
          // 파일명이 내용 해시라 내용이 바뀌지 않는다
          'cache-control': 'public, max-age=31536000, immutable',
          'x-content-type-options': 'nosniff',
        },
      })
    } catch (error) {
      // Never record the URL/path (user content). Failed reads must not be cached:
      // a sync restore or a transient filesystem error can make the next read succeed.
      const code = (error as NodeJS.ErrnoException).code
      logError(
        '[asset] read',
        ['ENOENT', 'EACCES', 'EPERM', 'EBUSY', 'EIO'].includes(code ?? '') ? code : 'failed',
      )
      return notFound()
    }
  })
}
