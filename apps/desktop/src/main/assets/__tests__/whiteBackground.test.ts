import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import {
  contentBounds,
  cutOutWhite,
  looksWhiteBackground,
  removeWhiteBackground,
  whiteBorderRatio,
} from '../whiteBackground'

/** w×h RGBA, 기본 흰색. paint(x, y)가 색을 주면 그 색 */
const image = (
  w: number,
  h: number,
  paint: (x: number, y: number) => [number, number, number] | null = () => null,
) => {
  const px = new Uint8Array(w * h * 4)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const [r, g, b] = paint(x, y) ?? [255, 255, 255]
      px.set([r, g, b, 255], (y * w + x) * 4)
    }
  return px
}
const alphaAt = (px: Uint8Array, w: number, x: number, y: number) => px[(y * w + x) * 4 + 3]!

// 흰 바탕 가운데 빨간 사각형(4..11), 그 안에 흰 구멍(7..8) — 구멍은 가장자리와 이어지지 않는다
const RED: [number, number, number] = [220, 40, 40]
const subject = (x: number, y: number) =>
  x >= 4 && x <= 11 && y >= 4 && y <= 11
    ? x >= 7 && x <= 8 && y >= 7 && y <= 8
      ? null
      : RED
    : null

describe('흰 배경 지우기', () => {
  it('가장자리와 이어진 흰색만 지우고, 그림 안의 흰 부분은 남긴다', () => {
    const px = image(16, 16, subject)
    const out = removeWhiteBackground(px, 16, 16, 40)
    expect(alphaAt(out, 16, 0, 0)).toBe(0)
    expect(alphaAt(out, 16, 2, 13)).toBe(0)
    expect(alphaAt(out, 16, 5, 5)).toBe(255) // 빨강 안쪽
    expect(alphaAt(out, 16, 7, 7)).toBe(255) // 막힌 흰 구멍은 그대로
    expect(px[3]).toBe(255) // 입력은 바꾸지 않는다
  })

  it('경계의 옅은 픽셀은 반투명 + 흰색을 빼서 흰 테가 남지 않게', () => {
    // 왼쪽 흰 바탕, x=3은 흰색과 반쯤 섞인 분홍(경계), 오른쪽은 빨강
    const px = image(8, 4, (x) => (x === 3 ? [238, 148, 148] : x > 3 ? RED : null))
    const out = removeWhiteBackground(px, 8, 4, 40)
    const a = alphaAt(out, 8, 3, 1)
    expect(a).toBeGreaterThan(0)
    expect(a).toBeLessThan(255)
    const i = (1 * 8 + 3) * 4
    expect(out[i + 1]!).toBeLessThan(148) // 흰색을 뺀 만큼 더 진해진다
  })

  it('지우는 정도가 크면 더 옅은 회색까지 지운다', () => {
    const px = image(6, 6, () => [215, 215, 215])
    expect(alphaAt(removeWhiteBackground(px, 6, 6, 10), 6, 0, 0)).toBe(255)
    expect(alphaAt(removeWhiteBackground(px, 6, 6, 60), 6, 0, 0)).toBe(0)
  })

  it('가장자리 흰색 비율', () => {
    expect(whiteBorderRatio(image(16, 16, subject), 16, 16)).toBe(1)
    expect(
      whiteBorderRatio(
        image(10, 10, () => RED),
        10,
        10,
      ),
    ).toBe(0)
  })

  it('보이는 픽셀 범위(다 투명하면 null)', () => {
    const out = removeWhiteBackground(image(16, 16, subject), 16, 16, 40)
    expect(contentBounds(out, 16, 16)).toEqual({ left: 4, top: 4, width: 8, height: 8 })
    expect(contentBounds(removeWhiteBackground(image(4, 4), 4, 4, 40), 4, 4)).toBeNull()
  })
})

describe('sharp 입출력', () => {
  const jpegOf = (px: Uint8Array, w: number, h: number) =>
    sharp(px, { raw: { width: w, height: h, channels: 4 } })
      .jpeg({ quality: 95 })
      .toBuffer()

  it('흰 배경 JPEG → 투명 PNG, 남은 그림 크기로 잘림', async () => {
    const w = 64
    const big = (x: number, y: number) => (x >= 16 && x < 48 && y >= 20 && y < 44 ? RED : null)
    const jpg = await jpegOf(image(w, w, big), w, w)
    expect(await looksWhiteBackground(jpg)).toBe(true)
    const out = await cutOutWhite(jpg, 40)
    const meta = await sharp(out).metadata()
    expect(meta.format).toBe('png')
    expect(meta.hasAlpha).toBe(true)
    // JPEG 번짐으로 1~2px 여유
    expect(Math.abs(meta.width! - 32)).toBeLessThanOrEqual(3)
    expect(Math.abs(meta.height! - 24)).toBeLessThanOrEqual(3)
  })

  it('흰 배경이 아니면 looksWhiteBackground false', async () => {
    const jpg = await jpegOf(
      image(32, 32, () => RED),
      32,
      32,
    )
    expect(await looksWhiteBackground(jpg)).toBe(false)
  })

  it('전부 흰색이면 nothing_left', async () => {
    const jpg = await jpegOf(image(16, 16), 16, 16)
    await expect(cutOutWhite(jpg, 40)).rejects.toMatchObject({ code: 'nothing_left' })
  })
})
