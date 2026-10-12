export type SniffedFormat = 'png' | 'jpeg' | 'webp'

const startsWith = (b: Uint8Array, sig: readonly number[], offset = 0) =>
  b.length >= offset + sig.length && sig.every((v, i) => b[offset + i] === v)

/**
 * 파일 앞부분의 매직 바이트로 형식을 판별한다. 허용 목록(PNG/JPEG/WebP) 외에는 null.
 * 확장자나 파일 이름은 신뢰하지 않는다. SVG/GIF/HEIF 등은 여기서 걸러져 디코더에 도달하지 않는다.
 */
export function sniffImage(b: Uint8Array): SniffedFormat | null {
  if (startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png'
  if (startsWith(b, [0xff, 0xd8, 0xff])) return 'jpeg'
  // RIFF....WEBP
  if (startsWith(b, [0x52, 0x49, 0x46, 0x46]) && startsWith(b, [0x57, 0x45, 0x42, 0x50], 8))
    return 'webp'
  return null
}
