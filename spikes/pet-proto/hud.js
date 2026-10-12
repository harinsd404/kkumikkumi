'use strict'
const LABEL = {
  idle: 'powerMonitor 유휴(키보드+마우스)',
  koffi: 'CoreGraphics keyDown (koffi)',
  swift: 'CoreGraphics keyDown (Swift 헬퍼)',
}
const fmt = (v) => (typeof v === 'number' ? v.toFixed(1) + '초' : String(v))
window.pet.on('hud', (d) => {
  const rows = Object.entries(d.values)
    .map(([k, v]) => `<tr><td>${LABEL[k] ?? k}</td><td class="v">${fmt(v)}</td></tr>`)
    .join('')
  document.getElementById('t').innerHTML =
    rows + `<tr><td>펫 상태 (감지: ${d.cfg.detect})</td><td class="v">${d.state}</td></tr>`
  document.getElementById('raw').textContent = JSON.stringify(
    { move: d.cfg.move, walk: d.walk, renderer: d.renderer },
    null,
    1,
  )
})
