'use strict'
// 펫 renderer. 정지 이미지 + 절차적 애니메이션(좌우 반전, 바운스, 방식 C는 이동까지).
const mode = new URLSearchParams(location.search).get('mode') || 'A'
const petEl = document.getElementById('pet')
const img = document.getElementById('img')
let images = {}
let state = 'rest'
let dir = 1
let cfg = { walking: true, alphaHit: true, speed: 60, move: mode }
let x = mode === 'C' ? window.innerWidth / 2 : 0
let over = false
let drag = null

/* 상태별 이미지(없으면 rest) */
const setImage = () => {
  img.src = images[state] || images.rest || ''
  alpha = null
}
window.pet.on('images', (v) => {
  images = v
  setImage()
})
window.pet.on('state', (s) => {
  state = s
  setImage()
})
window.pet.on('dir', (d) => {
  dir = d
})
window.pet.on('cfg', (c) => {
  cfg = c
})

/* 알파 히트 테스트: 이미지 픽셀이 거의 투명하면 펫 위가 아닌 것으로 본다 */
let alpha = null
function alphaAt(px, py) {
  if (!img.complete || !img.naturalWidth) return 255
  if (!alpha) {
    const c = document.createElement('canvas')
    c.width = img.naturalWidth
    c.height = img.naturalHeight
    const g = c.getContext('2d', { willReadFrequently: true })
    g.drawImage(img, 0, 0)
    alpha = { data: g.getImageData(0, 0, c.width, c.height).data, w: c.width, h: c.height }
  }
  const r = img.getBoundingClientRect()
  let u = (px - r.left) / r.width
  if (dir < 0) u = 1 - u // 좌우 반전 상태
  const ix = Math.floor(u * alpha.w)
  const iy = Math.floor(((py - r.top) / r.height) * alpha.h)
  if (ix < 0 || iy < 0 || ix >= alpha.w || iy >= alpha.h) return 0
  return alpha.data[(iy * alpha.w + ix) * 4 + 3]
}

function hitTest(e) {
  const r = img.getBoundingClientRect()
  const inBox =
    e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom
  if (!inBox) return false
  return cfg.alphaHit ? alphaAt(e.clientX, e.clientY) > 24 : true
}

function setOver(v) {
  if (over === v) return
  over = v
  document.body.classList.toggle('is-over', v)
  window.pet.hover(v) // main이 setIgnoreMouseEvents(!v, { forward: true })
}

// 클릭 통과 중에도 forward: true라 mousemove가 온다
document.addEventListener('mousemove', (e) => {
  if (!drag) setOver(hitTest(e))
})
document.addEventListener('mouseleave', () => {
  if (!drag) setOver(false)
})

img.addEventListener('pointerdown', (e) => {
  if (!over || e.button !== 0) return
  img.setPointerCapture(e.pointerId)
  const r = petEl.getBoundingClientRect()
  drag = { offX: e.clientX - r.left, offY: e.clientY - r.top }
  window.pet.drag({
    phase: 'start',
    screenX: e.screenX,
    screenY: e.screenY,
    offsetX: drag.offX,
    offsetY: drag.offY,
  })
})
img.addEventListener('pointermove', (e) => {
  if (!drag) return
  if (mode === 'C') x = Math.max(0, Math.min(window.innerWidth - 128, e.clientX - drag.offX))
  window.pet.drag({
    phase: 'move',
    screenX: e.screenX,
    screenY: e.screenY,
    offsetX: drag.offX,
    offsetY: drag.offY,
  })
})
const endDrag = (e) => {
  if (!drag) return
  drag = null
  window.pet.drag({ phase: 'end', screenX: e.screenX, screenY: e.screenY, offsetX: 0, offsetY: 0 })
  setOver(hitTest(e))
}
img.addEventListener('pointerup', endDrag)
img.addEventListener('pointercancel', endDrag)

/* 애니메이션 + 프레임 간격 측정 */
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
let last = performance.now()
let frames = []
let lastReport = last
function frame(now) {
  const dt = now - last
  last = now
  frames.push(dt)
  const walking = cfg.walking && !drag
  if (mode === 'C' && walking) {
    x += dir * cfg.speed * (dt / 1000)
    if (x < 0 || x > window.innerWidth - 128) {
      dir *= -1
      x = Math.max(0, Math.min(window.innerWidth - 128, x))
    }
  }
  const bounce = walking && !reduced ? Math.abs(Math.sin(now / 160)) * 6 : 0
  petEl.style.transform = `translate(${mode === 'C' ? x : 0}px, ${-bounce}px)`
  img.style.transform = `scaleX(${dir})`
  if (now - lastReport > 5000) {
    const s = [...frames].sort((a, b) => a - b)
    const mean = s.reduce((a, b) => a + b, 0) / s.length
    window.pet.stats({
      n: s.length,
      meanMs: +mean.toFixed(2),
      p95Ms: +s[Math.floor(s.length * 0.95)].toFixed(2),
      maxMs: +s[s.length - 1].toFixed(2),
      fps: +(1000 / mean).toFixed(1),
    })
    frames = []
    lastReport = now
  }
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)
