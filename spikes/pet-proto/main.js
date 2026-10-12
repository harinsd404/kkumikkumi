'use strict'
// M0 펫 스파이크(되는가 검증용). 코드 품질보다 측정과 비교가 목적이다.
// 프라이버시: 키 내용/키 코드는 읽지도 기록하지도 않는다. 기록하는 것은 "마지막 입력 이후 경과 초"뿐이다.
const { app, BrowserWindow, Menu, ipcMain, powerMonitor, screen } = require('electron')
const { spawn, execFileSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const AUTOTEST = process.env.PET_AUTOTEST === '1'
const LOG_DIR = path.join(__dirname, 'logs')
const HELPER = path.join(__dirname, 'helper', 'keyidle')
const PET = 128
const OVERLAY_H = 170
const TYPING_SEC = 1.5 // 이 시간 안에 키를 눌렀으면 typing

fs.mkdirSync(LOG_DIR, { recursive: true })
const log = (name, obj) =>
  fs.appendFileSync(
    path.join(LOG_DIR, `${name}.jsonl`),
    JSON.stringify({ t: Date.now(), ...obj }) + '\n',
  )

/* ───────── 설정(메뉴 스위치) ───────── */
const cfg = {
  enabled: true,
  move: 'A', // A: 작은 창 이동 / C: 하단 오버레이 안 CSS 이동
  detect: 'swift', // idle | koffi | swift
  level: 'floating', // setAlwaysOnTop 레벨
  allSpaces: false, // setVisibleOnAllWorkspaces
  fullScreen: false, // visibleOnFullScreen
  skipTransform: true, // skipTransformProcessType
  dockHidden: false,
  walking: true,
  alphaHit: true, // 투명 픽셀은 클릭 통과
  speed: 60, // px/s
}

/* ───────── 통계 ───────── */
class Stats {
  constructor() {
    this.v = []
  }
  push(x) {
    this.v.push(x)
    if (this.v.length > 20000) this.v.shift()
  }
  summary() {
    if (!this.v.length) return null
    const s = [...this.v].sort((a, b) => a - b)
    const mean = s.reduce((a, b) => a + b, 0) / s.length
    return {
      n: s.length,
      meanMs: +mean.toFixed(2),
      p95Ms: +s[Math.floor(s.length * 0.95)].toFixed(2),
      maxMs: +s[s.length - 1].toFixed(2),
      fps: +(1000 / mean).toFixed(1),
    }
  }
  reset() {
    this.v = []
  }
}

let win = null
let hud = null
const timers = { walk: null, poll: null }
let helper = null
let swiftValue = null
const pet = { x: 0, y: 0, dir: 1, state: 'rest', dragging: false, dragOff: null }
const walkStats = new Stats() // 방식 A: main 이동 루프 간격
const setBoundsCost = new Stats() // 방식 A: setBounds 호출 시간
let rendererStats = null // renderer rAF 간격(방식 A/C 공통)

/* ───────── 타이핑 감지 후보 ───────── */
let koffiFn = null
let koffiPreflight = null
function loadKoffi() {
  if (koffiFn) return
  const koffi = require('koffi')
  const cg = koffi.load('/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics')
  // stateID 1 = kCGEventSourceStateHIDSystemState, eventType 10 = kCGEventKeyDown (SDK 헤더 확인)
  koffiFn = cg.func('double CGEventSourceSecondsSinceLastEventType(int32_t, uint32_t)')
  koffiPreflight = cg.func('bool CGPreflightListenEventAccess()')
}

const detectors = {
  /** 기준선: 키보드+마우스 모든 입력(초, 정수) */
  idle: () => powerMonitor.getSystemIdleTime(),
  koffi: () => {
    loadKoffi()
    return koffiFn(1, 10)
  },
  swift: () => swiftValue,
}

function startHelper() {
  if (helper) return
  helper = spawn(HELPER, ['500'], { stdio: ['ignore', 'pipe', 'ignore'] })
  let buf = ''
  helper.stdout.on('data', (d) => {
    buf += d
    const lines = buf.split('\n')
    buf = lines.pop()
    const last = lines.filter(Boolean).pop()
    if (last !== undefined) swiftValue = Number(last)
  })
  helper.on('exit', () => {
    helper = null
  })
}
function stopHelper() {
  if (!helper) return
  helper.kill('SIGTERM')
  helper = null
  swiftValue = null
}

/** 펫이 켜져 있을 때만 폴링. 오래 안 치면 간격을 늘린다. */
function poll() {
  timers.poll = null
  if (!cfg.enabled) return
  const values = {}
  const need = hud ? Object.keys(detectors) : [cfg.detect]
  if (need.includes('swift')) startHelper()
  for (const k of need) {
    try {
      values[k] = detectors[k]()
    } catch (e) {
      values[k] = `error:${e.name}`
    }
  }
  const sec = values[cfg.detect]
  const typing = typeof sec === 'number' && sec < TYPING_SEC
  setPetState(typing ? 'typing' : 'rest')
  log('detect', { method: cfg.detect, values })
  hud?.webContents.send('hud', {
    values,
    state: pet.state,
    cfg,
    walk: walkStats.summary(),
    renderer: rendererStats,
  })
  const interval = typeof sec === 'number' && sec > 60 ? 3000 : 1000
  timers.poll = setTimeout(poll, interval)
}

function setPetState(s) {
  if (pet.state === s) return
  pet.state = s
  win?.webContents.send('state', s)
}

/* ───────── 창 ───────── */
const ground = () => {
  const wa = screen.getPrimaryDisplay().workArea
  return { wa, y: wa.y + wa.height - PET }
}

function applyLevel() {
  if (!win) return
  win.setAlwaysOnTop(true, cfg.level)
  win.setVisibleOnAllWorkspaces(cfg.allSpaces, {
    visibleOnFullScreen: cfg.fullScreen,
    skipTransformProcessType: cfg.skipTransform,
  })
}

function createPetWindow() {
  const { wa, y } = ground()
  const isA = cfg.move === 'A'
  const bounds = isA
    ? { x: wa.x + Math.round(wa.width / 2), y, width: PET, height: PET }
    : { x: wa.x, y: wa.y + wa.height - OVERLAY_H, width: wa.width, height: OVERLAY_H }
  pet.x = isA ? bounds.x : Math.round(wa.width / 2)
  pet.y = bounds.y
  win = new BrowserWindow({
    ...bounds,
    transparent: true,
    frame: false,
    hasShadow: false,
    resizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    focusable: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  applyLevel()
  win.setIgnoreMouseEvents(true, { forward: true })
  win.loadFile('pet.html', { query: { mode: cfg.move } })
  win.once('ready-to-show', () => win?.showInactive())
  win.webContents.once('did-finish-load', () => {
    win.webContents.send('images', petImages())
    win.webContents.send('state', pet.state)
    win.webContents.send('cfg', publicCfg())
  })
  win.on('closed', () => {
    win = null
  })
}

/** 펫 PNG를 data URL로(파일 URL 이미지는 canvas가 오염돼 알파 히트 테스트를 못 한다) */
const petImages = () =>
  Object.fromEntries(
    ['rest', 'music', 'typing'].map((s) => {
      const f = path.join(__dirname, 'assets', `${s}.png`)
      return [
        s,
        fs.existsSync(f) ? `data:image/png;base64,${fs.readFileSync(f).toString('base64')}` : null,
      ]
    }),
  )
const publicCfg = () => ({
  walking: cfg.walking,
  alphaHit: cfg.alphaHit,
  speed: cfg.speed,
  move: cfg.move,
})

/** 방식 A: main이 작은 창을 setBounds로 옮긴다 */
function walkA() {
  let last = performance.now()
  const tick = () => {
    timers.walk = setTimeout(tick, 16)
    const now = performance.now()
    const dt = now - last
    last = now
    if (!win || pet.dragging || !cfg.walking) return
    walkStats.push(dt)
    const { wa } = ground()
    pet.x += pet.dir * cfg.speed * (dt / 1000)
    if (pet.x < wa.x || pet.x > wa.x + wa.width - PET) {
      pet.dir *= -1
      pet.x = Math.max(wa.x, Math.min(wa.x + wa.width - PET, pet.x))
      win.webContents.send('dir', pet.dir)
    }
    const t0 = performance.now()
    win.setBounds({ x: Math.round(pet.x), y: Math.round(pet.y), width: PET, height: PET })
    setBoundsCost.push(performance.now() - t0)
  }
  timers.walk = setTimeout(tick, 16)
}

function setEnabled(on) {
  cfg.enabled = on
  if (on) {
    createPetWindow()
    if (cfg.move === 'A') walkA()
    poll()
  } else {
    // 끄면 창/폴링/이동 루프/헬퍼 프로세스를 모두 정리한다
    for (const k of Object.keys(timers)) {
      clearTimeout(timers[k])
      timers[k] = null
    }
    stopHelper()
    win?.destroy()
    win = null
  }
  buildMenu()
}

function restartPet() {
  if (!cfg.enabled) return buildMenu()
  setEnabled(false)
  setEnabled(true)
}

/* ───────── IPC ───────── */
ipcMain.on('hover', (e, over) => {
  if (!win || e.sender !== win.webContents) return
  win.setIgnoreMouseEvents(!over, { forward: true })
})
ipcMain.on('drag', (e, d) => {
  if (!win || e.sender !== win.webContents) return
  if (d.phase === 'start') {
    pet.dragging = true
    pet.dragOff = { x: d.offsetX, y: d.offsetY }
  } else if (d.phase === 'move' && pet.dragging && cfg.move === 'A') {
    pet.x = d.screenX - pet.dragOff.x
    pet.y = d.screenY - pet.dragOff.y
    win.setBounds({ x: Math.round(pet.x), y: Math.round(pet.y), width: PET, height: PET })
  } else if (d.phase === 'end') {
    pet.dragging = false
  }
})
ipcMain.on('stats', (e, s) => {
  if (e.sender !== win?.webContents) return
  rendererStats = s
  log('frames', { move: cfg.move, walking: cfg.walking, renderer: s })
})

/* ───────── 자원 사용량 ───────── */
function sampleMetrics() {
  const m = app.getAppMetrics()
  const cpu = m.reduce((a, p) => a + p.cpu.percentCPUUsage, 0)
  const memMB = m.reduce((a, p) => a + p.memory.workingSetSize, 0) / 1024
  const row = {
    enabled: cfg.enabled,
    move: cfg.move,
    walking: cfg.walking,
    cpuPct: +cpu.toFixed(2),
    memMB: +memMB.toFixed(1),
    procs: m.length,
  }
  log('metrics', row)
  return row
}

/* ───────── 메뉴 ───────── */
function buildMenu() {
  const radio = (label, key, value) => ({
    label,
    type: 'radio',
    checked: cfg[key] === value,
    click: () => {
      cfg[key] = value
      if (key === 'move') restartPet()
      else if (key === 'level') applyLevel()
      else buildMenu()
    },
  })
  const check = (label, key, after) => ({
    label,
    type: 'checkbox',
    checked: cfg[key],
    click: () => {
      cfg[key] = !cfg[key]
      after?.()
      buildMenu()
    },
  })
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      { role: 'appMenu' },
      {
        label: '펫',
        submenu: [
          { label: cfg.enabled ? '펫 끄기' : '펫 켜기', click: () => setEnabled(!cfg.enabled) },
          check('걷기', 'walking', () => win?.webContents.send('cfg', publicCfg())),
          check('투명 픽셀 클릭 통과(알파 히트 테스트)', 'alphaHit', () =>
            win?.webContents.send('cfg', publicCfg()),
          ),
          { type: 'separator' },
          radio('이동 방식 A: 작은 창 이동', 'move', 'A'),
          radio('이동 방식 C: 하단 오버레이', 'move', 'C'),
          { type: 'separator' },
          radio('감지: powerMonitor 유휴(기준선, 마우스 포함)', 'detect', 'idle'),
          radio('감지: CoreGraphics via koffi', 'detect', 'koffi'),
          radio('감지: Swift 헬퍼', 'detect', 'swift'),
          { type: 'separator' },
          radio('레벨: floating', 'level', 'floating'),
          radio('레벨: screen-saver', 'level', 'screen-saver'),
          check('모든 Space에 보이기', 'allSpaces', applyLevel),
          check('풀스크린 위에도 보이기', 'fullScreen', applyLevel),
          check('skipTransformProcessType', 'skipTransform', applyLevel),
          check('Dock 아이콘 숨기기(app.dock.hide)', 'dockHidden', () =>
            cfg.dockHidden ? app.dock.hide() : app.dock.show(),
          ),
          { type: 'separator' },
          { label: '측정 창(HUD) 열기', click: openHud },
          { label: '자원 사용량 기록', click: () => console.log(sampleMetrics()) },
        ],
      },
    ]),
  )
}

function openHud() {
  if (hud) return hud.focus()
  hud = new BrowserWindow({
    width: 420,
    height: 360,
    title: '펫 측정',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  hud.loadFile('hud.html')
  hud.on('closed', () => {
    hud = null
  })
}

/* ───────── 자동 측정(PET_AUTOTEST=1) ───────── */
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const alive = (pid) => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

async function capture(name) {
  if (!win) return null
  const img = await win.webContents.capturePage()
  const f = path.join(LOG_DIR, `${name}.png`)
  fs.writeFileSync(f, img.toPNG())
  return path.relative(__dirname, f)
}

async function phase(label, ms) {
  walkStats.reset()
  setBoundsCost.reset()
  rendererStats = null
  sampleMetrics() // 첫 호출은 기준점(percentCPUUsage는 직전 호출 이후 평균)
  const rows = []
  const end = Date.now() + ms
  while (Date.now() < end) {
    await wait(5000)
    rows.push(sampleMetrics())
  }
  const avg = (k) => +(rows.reduce((a, r) => a + r[k], 0) / rows.length).toFixed(2)
  return {
    label,
    cpuPctAvg: avg('cpuPct'),
    cpuPctMax: Math.max(...rows.map((r) => r.cpuPct)),
    memMBAvg: avg('memMB'),
    mainLoop: walkStats.summary(),
    setBoundsMs: setBoundsCost.summary(),
    rendererFrames: rendererStats,
  }
}

async function autotest() {
  const out = { startedAt: new Date().toISOString(), electron: process.versions.electron }

  // 1) 감지 후보: 값/지연/권한(프롬프트 없는 조회만)
  loadKoffi()
  const time = (fn) => {
    const t0 = performance.now()
    const v = fn()
    return { value: v, ms: +(performance.now() - t0).toFixed(3) }
  }
  out.detect = {
    idle: [1, 2, 3].map(() => time(detectors.idle)),
    koffi: [1, 2, 3].map(() => time(detectors.koffi)),
    koffiAnyInput: koffiFn(1, 0xffffffff),
    preflightKoffi: koffiPreflight(),
    preflightSwift: execFileSync(HELPER, ['--preflight']).toString().trim(),
    swiftOnceMs: (() => {
      const t0 = performance.now()
      const v = execFileSync(HELPER, ['--once']).toString().trim()
      return { value: Number(v), ms: +(performance.now() - t0).toFixed(1) }
    })(),
  }

  // 2) 이동 방식별 자원/프레임
  cfg.move = 'A'
  cfg.walking = true
  setEnabled(true)
  await wait(2500)
  out.captureA = await capture('pet-A')
  out.A_walk = await phase('A 걷기', 30000)
  cfg.walking = false
  win.webContents.send('cfg', publicCfg())
  out.A_still = await phase('A 정지', 20000)
  cfg.move = 'C'
  cfg.walking = true
  restartPet()
  await wait(2500)
  out.captureC = await capture('pet-C')
  out.C_walk = await phase('C 걷기', 30000)
  cfg.walking = false
  win.webContents.send('cfg', publicCfg())
  out.C_still = await phase('C 정지', 20000)

  // 3) 끄기 = 완전 종료(창, 타이머, 헬퍼 프로세스)
  cfg.detect = 'swift'
  cfg.walking = true
  cfg.move = 'A'
  restartPet()
  await wait(2000)
  const pid = helper?.pid ?? null
  const before = {
    windows: BrowserWindow.getAllWindows().length,
    helperPid: pid,
    helperAlive: pid ? alive(pid) : false,
  }
  setEnabled(false)
  await wait(1000)
  out.offCleanup = {
    before,
    after: {
      windows: BrowserWindow.getAllWindows().length,
      timers: Object.fromEntries(Object.entries(timers).map(([k, v]) => [k, v !== null])),
      helperAlive: pid ? alive(pid) : false,
    },
  }
  out.off = await phase('펫 꺼짐', 10000)

  fs.writeFileSync(path.join(LOG_DIR, 'autotest.json'), JSON.stringify(out, null, 2))
  console.log('[autotest] logs/autotest.json')
  app.quit()
}

/* ───────── 시작 ───────── */
app.whenReady().then(() => {
  buildMenu()
  if (AUTOTEST) {
    cfg.enabled = false
    void autotest()
  } else {
    setEnabled(true)
    openHud()
  }
})
app.on('window-all-closed', () => {}) // 펫을 꺼도 앱은 남는다(메뉴로 다시 켬)
app.on('before-quit', () => stopHelper())
