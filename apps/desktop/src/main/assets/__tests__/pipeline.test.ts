import { createHash, randomBytes } from 'node:crypto'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import {
  AssetError,
  DEFAULT_PIPELINE_OPTIONS,
  hasTransparentPixels,
  processImage,
} from '../pipeline'
import { sniffImage } from '../sniff'

const make = (w: number, h: number, alpha = 1) =>
  sharp({
    create: { width: w, height: h, channels: 4, background: { r: 200, g: 100, b: 50, alpha } },
  })

const png = (w = 64, h = 32, alpha = 1) => make(w, h, alpha).png().toBuffer()
const jpeg = (w = 64, h = 32) => make(w, h).jpeg().toBuffer()
const webp = (w = 64, h = 32, alpha = 1) => make(w, h, alpha).webp({ lossless: true }).toBuffer()

const errCode = async (p: Promise<unknown>) => {
  try {
    await p
    return 'resolved'
  } catch (e) {
    return e instanceof AssetError ? e.code : `other:${String(e)}`
  }
}

describe('sniffImage', () => {
  it('PNG/JPEG/WebP만 인식', async () => {
    expect(sniffImage(await png())).toBe('png')
    expect(sniffImage(await jpeg())).toBe('jpeg')
    expect(sniffImage(await webp())).toBe('webp')
  })
  it('SVG/GIF/텍스트/빈 입력은 null', async () => {
    expect(sniffImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull()
    expect(sniffImage(await make(4, 4).gif().toBuffer())).toBeNull()
    expect(sniffImage(Buffer.from('GIF89a'))).toBeNull()
    expect(sniffImage(new Uint8Array())).toBeNull()
  })
})

describe('processImage', () => {
  it('PNG → PNG, 해시는 재인코딩 바이트의 sha256', async () => {
    const r = await processImage(await png(), 'image')
    expect(r.asset).toMatchObject({
      mime: 'image/png',
      width: 64,
      height: 32,
      bytes: r.data.byteLength,
    })
    expect(r.asset.hash).toBe(createHash('sha256').update(r.data).digest('hex'))
    expect(sniffImage(r.data)).toBe('png')
    expect(r.hasTransparency).toBe(false)
  })

  it('같은 입력은 같은 해시', async () => {
    const input = await png()
    expect((await processImage(input, 'image')).asset.hash).toBe(
      (await processImage(input, 'image')).asset.hash,
    )
  })

  it('JPEG → JPEG', async () => {
    const r = await processImage(await jpeg(), 'image')
    expect(r.asset.mime).toBe('image/jpeg')
    expect(sniffImage(r.data)).toBe('jpeg')
  })

  it('WebP: 투명 있으면 PNG, 없으면 JPEG', async () => {
    const t = await processImage(await webp(64, 32, 0.5), 'image')
    expect([t.asset.mime, t.hasTransparency]).toEqual(['image/png', true])
    const o = await processImage(await webp(), 'image')
    expect(o.asset.mime).toBe('image/jpeg')
  })

  it('긴 변을 maxEdge로 축소 (비율 유지, 확대 없음)', async () => {
    const r = await processImage(await jpeg(4000, 1000), 'image')
    expect([r.asset.width, r.asset.height]).toEqual([3200, 800])
    const small = await processImage(await png(10, 10), 'image')
    expect([small.asset.width, small.asset.height]).toEqual([10, 10])
  })

  it('펫: PNG만, 512px로 축소, 투명 여부 판별', async () => {
    expect(await errCode(processImage(await jpeg(), 'pet'))).toBe('pet_png_only')
    expect(await errCode(processImage(await webp(), 'pet'))).toBe('pet_png_only')
    const r = await processImage(await png(1024, 1024, 0), 'pet')
    expect(r.asset).toMatchObject({ mime: 'image/png', width: 512, height: 512 })
    expect(r.hasTransparency).toBe(true)
    expect((await processImage(await png(), 'pet')).hasTransparency).toBe(false)
  })

  it('SVG/GIF/임의 바이트 거부 (확장자 위조 포함: 내용만 본다)', async () => {
    expect(
      await errCode(
        processImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'image'),
      ),
    ).toBe('unsupported_format')
    expect(await errCode(processImage(await make(4, 4).gif().toBuffer(), 'image'))).toBe(
      'unsupported_format',
    )
    expect(await errCode(processImage(await make(4, 4).tiff().toBuffer(), 'image'))).toBe(
      'unsupported_format',
    )
  })

  it('손상된 이미지(시그니처만 맞음) 거부', async () => {
    const good = await png()
    const broken = Buffer.concat([good.subarray(0, 8), Buffer.alloc(200, 0x41)])
    expect(await errCode(processImage(broken, 'image'))).toBe('decode_failed')
    const truncated = (await jpeg()).subarray(0, 40)
    expect(await errCode(processImage(truncated, 'image'))).toBe('decode_failed')
  })

  it('픽셀 폭탄 거부 (디코딩 전 픽셀 상한)', async () => {
    const big = await png(3000, 3000)
    const opts = { ...DEFAULT_PIPELINE_OPTIONS, maxInputPixels: 1_000_000 }
    expect(await errCode(processImage(big, 'image', opts))).toBe('too_many_pixels')
  })

  it('입력 바이트 상한과 빈 입력 거부', async () => {
    const opts = { ...DEFAULT_PIPELINE_OPTIONS, maxInputBytes: 10 }
    expect(await errCode(processImage(await png(), 'image', opts))).toBe('too_large_input')
    expect(await errCode(processImage(new Uint8Array(), 'image'))).toBe('empty')
  })

  it('EXIF 등 메타데이터를 제거한다', async () => {
    const withExif = await make(32, 32)
      .jpeg()
      .withExif({ IFD0: { Copyright: 'secret-location' } })
      .toBuffer()
    expect((await sharp(withExif).metadata()).exif).toBeDefined()
    const r = await processImage(withExif, 'image')
    expect((await sharp(r.data).metadata()).exif).toBeUndefined()
  })

  it('용량 상한을 넘는 불투명 PNG는 JPEG로 전환해 저장', async () => {
    // 무작위 노이즈 PNG는 압축이 거의 안 돼 5MB를 넘는다
    const w = 1800
    const h = 1200
    const noise = randomBytes(w * h * 3)
    const big = await sharp(noise, { raw: { width: w, height: h, channels: 3 } })
      .png()
      .toBuffer()
    expect(big.byteLength).toBeGreaterThan(5 * 1024 * 1024)
    const r = await processImage(big, 'image')
    expect(r.asset.bytes).toBeLessThanOrEqual(5 * 1024 * 1024)
    expect(r.asset.mime).toBe('image/jpeg')
  })
})

describe('hasTransparentPixels', () => {
  it('알파 채널이 있어도 전부 불투명하면 false', async () => {
    expect(await hasTransparentPixels(await png(8, 8, 1))).toBe(false)
    expect(await hasTransparentPixels(await png(8, 8, 0.2))).toBe(true)
    expect(await hasTransparentPixels(await jpeg())).toBe(false)
  })
})
