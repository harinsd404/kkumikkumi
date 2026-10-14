import sharp from 'sharp'

// 흰 배경 지우기(순수 함수 + sharp 입출력). 가장자리와 이어진 "흰색에 가까운" 픽셀만 투명하게 만든다.
// 픽셀 버퍼는 RGBA(채널 4개), 행 우선.

/** 흰색에서 떨어진 정도: 0(흰색) … 255(가장 어두운 채널이 0) */
const offWhite = (px: Uint8Array, i: number) => 255 - Math.min(px[i]!, px[i + 1]!, px[i + 2]!)

/** 지우는 정도(0~100) → 흰색으로 볼 최대 거리 */
export const thresholdOf = (strength: number) =>
  6 + Math.round(Math.min(Math.max(strength, 0), 100) * 0.9)
/** 경계를 부드럽게 만드는 폭(흰색 거리). 진한 색과 흰색이 반쯤 섞인 경계 픽셀(거리 ~110)도 반투명이 되게. */
const FEATHER = 128
/** 경계 픽셀의 최소 불투명도(옅은 그림의 테두리가 사라지지 않게) */
const MIN_EDGE_ALPHA = 0.25

/** 가장자리 픽셀 중 흰색에 가까운 비율(0~1). 투명한 픽셀은 흰색으로 보지 않는다. */
export function whiteBorderRatio(
  px: Uint8Array,
  w: number,
  h: number,
  threshold = thresholdOf(40),
): number {
  let white = 0
  let total = 0
  const check = (x: number, y: number) => {
    const i = (y * w + x) * 4
    total++
    if (px[i + 3]! > 250 && offWhite(px, i) <= threshold) white++
  }
  for (let x = 0; x < w; x++) {
    check(x, 0)
    if (h > 1) check(x, h - 1)
  }
  for (let y = 1; y < h - 1; y++) {
    check(0, y)
    if (w > 1) check(w - 1, y)
  }
  return total === 0 ? 0 : white / total
}

/**
 * 가장자리에서 시작해 이어진 흰색 영역(거리 ≤ threshold)을 투명하게 만든다(4방향 연결).
 * 지운 영역 바로 옆 픽셀은 흰색에 가까운 만큼 반투명하게 하고, 섞여 있던 흰색을 빼서 흰 테를 줄인다.
 * 입력은 바꾸지 않고 새 버퍼를 돌려준다.
 */
export function removeWhiteBackground(
  px: Uint8Array,
  w: number,
  h: number,
  strength: number,
): Uint8Array {
  const out = new Uint8Array(px)
  const t = thresholdOf(strength)
  const removed = new Uint8Array(w * h)
  const stack: number[] = []
  const push = (x: number, y: number) => {
    const p = y * w + x
    if (removed[p]) return
    if (offWhite(px, p * 4) > t && px[p * 4 + 3]! > 0) return
    removed[p] = 1
    stack.push(p)
  }
  for (let x = 0; x < w; x++) {
    push(x, 0)
    push(x, h - 1)
  }
  for (let y = 0; y < h; y++) {
    push(0, y)
    push(w - 1, y)
  }
  while (stack.length) {
    const p = stack.pop()!
    const x = p % w
    const y = (p - x) / w
    if (x > 0) push(x - 1, y)
    if (x < w - 1) push(x + 1, y)
    if (y > 0) push(x, y - 1)
    if (y < h - 1) push(x, y + 1)
  }
  for (let p = 0; p < w * h; p++) {
    const i = p * 4
    if (removed[p]) {
      out[i + 3] = 0
      continue
    }
    // 지운 영역과 맞닿은(8방향) 픽셀만 경계로 본다
    const x = p % w
    const y = (p - x) / w
    let edge = false
    for (let dy = -1; dy <= 1 && !edge; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx
        const ny = y + dy
        if (nx >= 0 && ny >= 0 && nx < w && ny < h && removed[ny * w + nx]) {
          edge = true
          break
        }
      }
    if (!edge) continue
    const d = offWhite(px, i)
    if (d >= t + FEATHER) continue
    const a = Math.max((d - t) / FEATHER, MIN_EDGE_ALPHA)
    // 흰색과 섞인 색에서 흰색을 뺀다: c = a·c' + (1−a)·255 → c' = (c − (1−a)·255) / a
    for (let c = 0; c < 3; c++) {
      out[i + c] = Math.round(Math.min(Math.max((px[i + c]! - (1 - a) * 255) / a, 0), 255))
    }
    out[i + 3] = Math.round(px[i + 3]! * a)
  }
  return out
}

/** 보이는 픽셀(알파 > 8)을 모두 담는 가장 작은 사각형. 다 투명하면 null. */
export function contentBounds(
  px: Uint8Array,
  w: number,
  h: number,
): { left: number; top: number; width: number; height: number } | null {
  let minX = w
  let minY = h
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (px[(y * w + x) * 4 + 3]! <= 8) continue
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  if (maxX < 0) return null
  return { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 }
}

/** 미리보기용 작은 크기로 읽어 흰 배경처럼 보이는지(가장자리 90% 이상이 흰색) */
export async function looksWhiteBackground(input: Uint8Array): Promise<boolean> {
  const { data, info } = await sharp(input, { failOn: 'error' })
    .rotate()
    .resize({ width: 256, height: 256, fit: 'inside', withoutEnlargement: true })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  return whiteBorderRatio(new Uint8Array(data), info.width, info.height) >= 0.9
}

export class CutoutError extends Error {
  constructor(readonly code: 'nothing_left') {
    super(code)
    this.name = 'CutoutError'
  }
}

/** 흰 배경을 지우고 남은 그림 크기로 잘라 PNG 바이트로 만든다(저장 전 processImage로 다시 정규화). */
export async function cutOutWhite(input: Uint8Array, strength: number): Promise<Uint8Array> {
  const { data, info } = await sharp(input, { failOn: 'error' })
    .rotate()
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const px = removeWhiteBackground(new Uint8Array(data), info.width, info.height, strength)
  const box = contentBounds(px, info.width, info.height)
  if (!box) throw new CutoutError('nothing_left')
  const png = await sharp(px, { raw: { width: info.width, height: info.height, channels: 4 } })
    .extract(box)
    .png()
    .toBuffer()
  return new Uint8Array(png)
}
