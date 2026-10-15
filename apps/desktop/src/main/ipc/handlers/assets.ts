import { Sha256, Uuid } from '@kkumikkumi/schema'
import { readFile } from 'node:fs/promises'
import { z } from 'zod'
import type { AssetPurpose } from '../../../shared/api'
import { DEFAULT_PIPELINE_OPTIONS, processImage } from '../../assets/pipeline'
import { cutOutWhite, looksWhiteBackground } from '../../assets/whiteBackground'
import { NotFoundError } from '../../db/repos'
import { Purpose } from '../inputs'
import { assertTheme, type HandlerDeps, type HandlersOf } from './deps'

export function assetHandlers(d: HandlerDeps): HandlersOf<'assets'> {
  const pipelineOpts = d.pipeline ?? DEFAULT_PIPELINE_OPTIONS
  const { themes } = d

  const importBytes = async (themeId: string, purpose: AssetPurpose, bytes: Uint8Array) => {
    await assertTheme(d, themeId)
    const { asset, data, hasTransparency } = await processImage(bytes, purpose, pipelineOpts)
    await themes.writeAsset(themeId, asset, data)
    const whiteBackground = purpose === 'image' && !hasTransparency && (await looksWhite(data))
    return { asset, hasTransparency, whiteBackground }
  }
  // 판별 실패는 "흰 배경 아님"으로(가져오기 자체는 이미 성공)
  const looksWhite = (data: Uint8Array) => looksWhiteBackground(data).catch(() => false)

  /** 테마 assets 폴더의 에셋 바이트(확장자는 저장 형식 둘 중 하나) */
  const readAsset = async (themeId: string, hash: string) => {
    for (const mime of ['image/png', 'image/jpeg'] as const) {
      try {
        return new Uint8Array(await readFile(themes.assetPath(themeId, { hash, mime })))
      } catch {
        // 다음 형식
      }
    }
    throw new NotFoundError('asset')
  }

  return {
    'assets.importFromDialog': async (i) => {
      const { themeId, purpose } = z.strictObject({ themeId: Uuid, purpose: Purpose }).parse(i)
      await assertTheme(d, themeId)
      const bytes = await d.pickImageFile(purpose)
      return bytes ? importBytes(themeId, purpose, bytes) : null
    },
    'assets.importBytes': async (i) => {
      const { themeId, purpose, bytes } = z
        .strictObject({
          themeId: Uuid,
          purpose: Purpose,
          bytes: z
            .instanceof(Uint8Array)
            .refine((b) => b.byteLength <= pipelineOpts.maxInputBytes, 'too_large'),
        })
        .parse(i)
      return importBytes(themeId, purpose, bytes)
    },

    'assets.removeWhiteBackground': async (i) => {
      const { themeId, hash, strength } = z
        .strictObject({ themeId: Uuid, hash: Sha256, strength: z.number().int().min(0).max(100) })
        .parse(i)
      await assertTheme(d, themeId)
      const png = await cutOutWhite(await readAsset(themeId, hash), strength)
      const { asset, data, hasTransparency } = await processImage(png, 'image', pipelineOpts)
      await themes.writeAsset(themeId, asset, data)
      return { asset, hasTransparency, whiteBackground: false }
    },
  }
}
