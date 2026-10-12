// 자체 제작 플레이스홀더 펫 PNG 3장(rest/music/typing). 외부 에셋/의존성 없이 Node zlib로 직접 인코딩한다.
import { writeFileSync } from 'node:fs'
import { deflateSync, crc32 } from 'node:zlib'

const W = 128
const H = 128

function png(pixels) {
  const raw = Buffer.alloc((W * 4 + 1) * H)
  for (let y = 0; y < H; y++) {
    raw[y * (W * 4 + 1)] = 0 // filter: none
    pixels.copy(raw, y * (W * 4 + 1) + 1, y * W * 4, (y + 1) * W * 4)
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const td = Buffer.concat([Buffer.from(type), data])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(td))
    return Buffer.concat([len, td, crc])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(W, 0)
  ihdr.writeUInt32BE(H, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))

function canvas() {
  const px = Buffer.alloc(W * H * 4) // 투명
  // 가장자리 1px을 부드럽게: 거리 기반 커버리지
  const blend = (x, y, rgb, a) => {
    if (x < 0 || y < 0 || x >= W || y >= H || a <= 0) return
    const i = (y * W + x) * 4
    const da = px[i + 3] / 255
    const oa = a + da * (1 - a)
    for (let c = 0; c < 3; c++)
      px[i + c] = Math.round((rgb[c] * a + px[i + c] * da * (1 - a)) / (oa || 1))
    px[i + 3] = Math.round(oa * 255)
  }
  return {
    px,
    ellipse(cx, cy, rx, ry, color) {
      const rgb = hex(color)
      for (let y = Math.floor(cy - ry - 1); y <= cy + ry + 1; y++)
        for (let x = Math.floor(cx - rx - 1); x <= cx + rx + 1; x++) {
          const d = Math.hypot((x + 0.5 - cx) / rx, (y + 0.5 - cy) / ry)
          blend(x, y, rgb, Math.max(0, Math.min(1, (1 - d) * Math.min(rx, ry) + 0.5)))
        }
    },
    rect(x0, y0, w, h, color) {
      const rgb = hex(color)
      for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) blend(x, y, rgb, 1)
    },
  }
}

function base() {
  const c = canvas()
  c.ellipse(64, 108, 38, 8, '#000000') // 그림자는 아래에서 다시 옅게
  c.px.forEach((v, i) => {
    if (i % 4 === 3) c.px[i] = Math.round(v * 0.15)
  })
  c.ellipse(64, 72, 44, 38, '#f2c879') // 몸
  c.ellipse(38, 38, 10, 14, '#f2c879') // 귀
  c.ellipse(90, 38, 10, 14, '#f2c879')
  c.ellipse(50, 66, 5, 6, '#4a3a36') // 눈
  c.ellipse(78, 66, 5, 6, '#4a3a36')
  c.ellipse(64, 80, 6, 4, '#e59a8c') // 입
  return c
}

const rest = base()
const music = base()
music.ellipse(104, 30, 7, 5, '#4a3a36') // 음표
music.rect(109, 8, 3, 22, '#4a3a36')
const typing = base()
typing.rect(30, 94, 68, 16, '#806e7a') // 키보드
for (let i = 0; i < 6; i++) typing.rect(34 + i * 11, 98, 8, 8, '#f6ebb5')

for (const [name, c] of Object.entries({ rest, music, typing })) {
  writeFileSync(new URL(`../assets/${name}.png`, import.meta.url), png(c.px))
}
console.log('assets: rest.png music.png typing.png')
