// 앱 아이콘 만들기: build/logo-source.png(1024, 둥근 사각형 그림 + 바깥 흰 바탕) →
// build/icon.png(1024, 둥근 사각형 바깥 투명, macOS 아이콘 격자에 맞춰 본체 824px).
// 사용법: node scripts/make-icon.mjs  (원본이 바뀌면 타일 경계 TILE을 다시 잰다)
import sharp from 'sharp'
import { fileURLToPath } from 'node:url'

const src = fileURLToPath(new URL('../build/logo-source.png', import.meta.url))
const out = fileURLToPath(new URL('../build/icon.png', import.meta.url))

/** 원본에서 잰 둥근 사각형(바깥 흰 테두리 2px 안쪽) */
const TILE = { left: 46, top: 45, size: 932, radius: 172 }
const CANVAS = 1024
const BODY = 824 // macOS 앱 아이콘 격자의 본체 크기

const mask = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${TILE.size}" height="${TILE.size}">` +
    `<rect width="${TILE.size}" height="${TILE.size}" rx="${TILE.radius}" ry="${TILE.radius}" fill="#fff"/></svg>`,
)

const tile = await sharp(src)
  .extract({ left: TILE.left, top: TILE.top, width: TILE.size, height: TILE.size })
  .ensureAlpha()
  .composite([{ input: mask, blend: 'dest-in' }])
  .png()
  .toBuffer()

const body = await sharp(tile).resize(BODY, BODY).png().toBuffer()
const margin = (CANVAS - BODY) / 2
await sharp({
  create: {
    width: CANVAS,
    height: CANVAS,
    channels: 4,
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  },
})
  .composite([{ input: body, left: margin, top: margin }])
  .png()
  .toFile(out)
console.log(`icon → ${out}`)
