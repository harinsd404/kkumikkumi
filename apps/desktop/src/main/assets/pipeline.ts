import { createHash } from 'node:crypto'
import { LIMITS, type Asset } from '@kkumikkumi/schema'
import sharp from 'sharp'
import { sniffImage, type SniffedFormat } from './sniff'

export type AssetPurpose = 'image' | 'pet'

export type AssetErrorCode =
  | 'empty'
  | 'too_large_input'
  | 'unsupported_format'
  | 'pet_png_only'
  | 'format_mismatch'
  | 'too_many_pixels'
  | 'decode_failed'
  | 'too_large_output'

export class AssetError extends Error {
  constructor(readonly code: AssetErrorCode) {
    super(code)
    this.name = 'AssetError'
  }
}

export interface PipelineOptions {
  /** 입력 바이트 상한 (재인코딩 전) */
  maxInputBytes: number
  /** 디코딩 전에 거부할 픽셀 수 상한 (압축 폭탄 방지) */
  maxInputPixels: number
  /** 저장할 긴 변 최대 px (purpose별) */
  maxEdge: Record<AssetPurpose, number>
}

export const DEFAULT_PIPELINE_OPTIONS: PipelineOptions = {
  maxInputBytes: 25 * 1024 * 1024,
  maxInputPixels: 50_000_000, // 약 8660x5770
  // 이미지: 1600x1000 논리 캔버스의 2x 배경까지 대응. 펫: 최대 256px 표시의 2x.
  maxEdge: { image: 3200, pet: 512 },
}

export interface ProcessedAsset {
  asset: Asset
  data: Buffer
  /** 실제로 투명/반투명 픽셀이 있는지 (펫 PNG 경고용) */
  hasTransparency: boolean
}

/** 알파 채널이 실제로 쓰이는지 판별 (채널 존재 여부가 아니라 불투명하지 않은 픽셀이 있는지) */
export async function hasTransparentPixels(input: Uint8Array): Promise<boolean> {
  const img = sharp(input, { failOn: 'error' })
  const meta = await img.metadata()
  if (!meta.hasAlpha) return false
  const { isOpaque } = await img.stats()
  return !isOpaque
}

/**
 * 신뢰할 수 없는 이미지 바이트 → 정규화된 에셋.
 * 형식 확인(매직 바이트) → 메타데이터 형식 재확인 → 픽셀 상한 → 디코딩(EXIF 회전 적용, 메타데이터 제거)
 * → 축소 → PNG/JPEG 재인코딩 → sha256(재인코딩 바이트)
 * 저장 형식: PNG→PNG, JPEG→JPEG, WebP→투명 있으면 PNG/없으면 JPEG, 펫→PNG만.
 */
export async function processImage(
  input: Uint8Array,
  purpose: AssetPurpose,
  opts: PipelineOptions = DEFAULT_PIPELINE_OPTIONS,
): Promise<ProcessedAsset> {
  if (input.byteLength === 0) throw new AssetError('empty')
  if (input.byteLength > opts.maxInputBytes) throw new AssetError('too_large_input')

  const sniffed = sniffImage(input)
  if (!sniffed) throw new AssetError('unsupported_format')
  if (purpose === 'pet' && sniffed !== 'png') throw new AssetError('pet_png_only')

  const decodeOpts = {
    failOn: 'error',
    limitInputPixels: opts.maxInputPixels,
    animated: false,
  } as const
  let meta: Awaited<ReturnType<ReturnType<typeof sharp>['metadata']>>
  try {
    meta = await sharp(input, decodeOpts).metadata()
  } catch (err) {
    throw classify(err)
  }
  if (meta.format !== sniffed) throw new AssetError('format_mismatch')
  if (!meta.width || !meta.height) throw new AssetError('decode_failed')
  if (meta.width * meta.height > opts.maxInputPixels) throw new AssetError('too_many_pixels')

  let transparent: boolean
  try {
    transparent = sniffed !== 'jpeg' && (await hasTransparentPixels(input))
  } catch (err) {
    throw classify(err)
  }
  let out = outputFormat(sniffed, purpose, transparent)
  let edge = opts.maxEdge[purpose]

  const encode = async (fmt: 'png' | 'jpeg', maxEdge: number) => {
    try {
      const pipeline = sharp(input, decodeOpts)
        .rotate() // EXIF orientation 적용. 출력에는 메타데이터(EXIF/GPS 등)를 붙이지 않는다.
        .resize({ width: maxEdge, height: maxEdge, fit: 'inside', withoutEnlargement: true })
      const encoded =
        fmt === 'png'
          ? pipeline.png({ compressionLevel: 9, adaptiveFiltering: true })
          : pipeline.flatten({ background: '#ffffff' }).jpeg({ quality: 85, mozjpeg: true })
      return await encoded.toBuffer({ resolveWithObject: true })
    } catch (err) {
      throw classify(err)
    }
  }

  // 용량 상한을 넘으면: 투명도가 없는 일반 이미지는 JPEG로 전환, 그래도 크면 긴 변을 줄여 재시도.
  let { data, info } = await encode(out, edge)
  for (let attempt = 0; data.byteLength > LIMITS.maxAssetBytes && attempt < 4; attempt++) {
    if (out === 'png' && purpose === 'image' && !transparent) out = 'jpeg'
    else edge = Math.floor(Math.min(edge, Math.max(info.width, info.height)) * 0.75)
    ;({ data, info } = await encode(out, edge))
  }
  if (data.byteLength > LIMITS.maxAssetBytes) throw new AssetError('too_large_output')

  return {
    asset: {
      hash: createHash('sha256').update(data).digest('hex'),
      mime: out === 'png' ? 'image/png' : 'image/jpeg',
      width: info.width,
      height: info.height,
      bytes: data.byteLength,
    },
    data,
    hasTransparency: out === 'png' && transparent,
  }
}

function outputFormat(
  src: SniffedFormat,
  purpose: AssetPurpose,
  transparent: boolean,
): 'png' | 'jpeg' {
  if (purpose === 'pet') return 'png'
  if (src === 'webp') return transparent ? 'png' : 'jpeg'
  return src
}

function classify(err: unknown): AssetError {
  if (err instanceof AssetError) return err
  const msg = err instanceof Error ? err.message : ''
  if (/pixel limit/i.test(msg)) return new AssetError('too_many_pixels')
  return new AssetError('decode_failed')
}
