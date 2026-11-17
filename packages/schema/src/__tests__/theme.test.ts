import { describe, expect, it } from 'vitest'
import { blockRect, parseTheme } from '../theme'
import { H, U, baseTheme } from './fixtures'

const messages = (raw: unknown): string[] => {
  const r = parseTheme(raw)
  return r.success ? [] : r.error.issues.map((i) => i.message)
}

const expectOk = (raw: unknown) => {
  const r = parseTheme(raw)
  expect(r.success, r.success ? '' : JSON.stringify(r.error.issues)).toBe(true)
}

const expectBad = (raw: unknown, msg?: string) => {
  const r = parseTheme(raw)
  expect(r.success).toBe(false)
  if (msg) expect(messages(raw).join(' | ')).toContain(msg)
}

describe('ThemeSchema', () => {
  it('디자인 레이아웃 유효', () => expectOk(baseTheme()))

  describe('그리드', () => {
    it('블록 겹침 거부', () => {
      const t = baseTheme()
      t.blocks[0].col = 3 // 캘린더(4칸)가 투두(col 4)를 덮음
      expectBad(t, '겹침')
    })
    it('calendar S 금지', () => {
      const t = baseTheme()
      t.blocks[0].size = 'S'
      expectBad(t, '쓸 수 없음')
    })
    it('그리드 범위 초과 거부', () => {
      const t = baseTheme()
      t.blocks[2].col = 7
      expectBad(t, '범위')
    })
    it('L(4x3) 아래로 범위 초과 거부', () => {
      const t = baseTheme()
      t.blocks[0].row = 3
      expectBad(t, '범위')
    })
    it('타이머 M 허용', () => {
      const t = baseTheme()
      t.blocks[3].size = 'M' // (6,1) 2x2
      t.blocks[4].row = 3
      expectOk(t)
    })
    it('타이머 L 금지', () => {
      const t = baseTheme()
      t.blocks[3].size = 'L'
      expectBad(t, '쓸 수 없음')
    })

    it('메모 블록: memoId(null 또는 UUID)만 허용, 크기는 S/M/L', () => {
      const t = baseTheme()
      const i = t.blocks.findIndex((b: { type: string }) => b.type === 'todo')
      t.blocks[i] = { ...t.blocks[i], type: 'memo', props: { memoId: null } }
      expectOk(t)
      t.blocks[i].props = { memoId: U(900) }
      expectOk(t)
      t.blocks[i].props = { memoId: U(900), body: '<b>x</b>' }
      expectBad(t)
      t.blocks[i].props = { memoId: null }
      t.blocks[i].size = 'W'
      expectBad(t, '쓸 수 없음')
    })

    it('시간표 블록: timetableId(null 또는 UUID)만, 예전 {}는 null로 읽음, 크기는 S/M/L', () => {
      const t = baseTheme()
      const i = t.blocks.findIndex((b: { type: string }) => b.type === 'todo')
      t.blocks[i] = { ...t.blocks[i], type: 'timetable', props: {} }
      const old = parseTheme(t)
      expect(old.success && old.data.blocks[i]!.props).toEqual({ timetableId: null })
      t.blocks[i].props = { timetableId: U(900) }
      expectOk(t)
      t.blocks[i].props = { timetableId: 'x' }
      expectBad(t)
      t.blocks[i].props = { timetableId: null, entries: [] }
      expectBad(t)
      t.blocks[i].props = { timetableId: null }
      t.blocks[i].size = 'W'
      expectBad(t, '쓸 수 없음')
    })

    it('블록 배경 사진: 없던 테마는 null로 읽고, 매니페스트에 있는 에셋만, 덮개 0~0.8', () => {
      const t = baseTheme()
      const i = t.blocks.findIndex((b: { type: string }) => b.type === 'todo')
      delete t.blocks[i].style.bgImage
      const r = parseTheme(t)
      expect(r.success && r.data.blocks[i]!.style.bgImage).toBeNull()
      const hash = t.assets[0].hash
      t.blocks[i].style.bgImage = { assetHash: hash, focus: { x: 0.2, y: 0.8 }, veil: 0.35 }
      expectOk(t)
      t.blocks[i].style.bgImage.veil = 0.9
      expectBad(t)
      t.blocks[i].style.bgImage = { assetHash: H('9'), focus: { x: 0.5, y: 0.5 }, veil: 0 }
      expectBad(t, '매니페스트')
    })

    it('습관 블록: 설정 없음, 크기 S/M/L', () => {
      const t = baseTheme()
      const i = t.blocks.findIndex((b: { type: string }) => b.type === 'todo')
      t.blocks[i] = { ...t.blocks[i], type: 'habits', size: 'M', props: {} }
      expectOk(t)
      t.blocks[i].props = { habitId: U(1) }
      expectBad(t)
    })

    it('스프린트 블록: sprintId(null 또는 UUID)만', () => {
      const t = baseTheme()
      const i = t.blocks.findIndex((b: { type: string }) => b.type === 'todo')
      t.blocks[i] = { ...t.blocks[i], type: 'sprint', size: 'M', props: { sprintId: null } }
      expectOk(t)
      t.blocks[i].props = { sprintId: U(901) }
      expectOk(t)
      t.blocks[i].props = { sprintId: 'x' }
      expectBad(t)
    })

    it('새 위젯 블록: 공부 통계·진행률·시계 설정 검증', () => {
      const t = baseTheme()
      const i = t.blocks.findIndex((b: { type: string }) => b.type === 'todo')
      t.blocks[i] = { ...t.blocks[i], type: 'studyStats', size: 'M', props: {} }
      expectOk(t)
      t.blocks[i] = {
        ...t.blocks[i],
        type: 'progress',
        props: {
          periods: [
            { kind: 'week' },
            { kind: 'custom', label: '2학기', start: '2026-09-01', end: '2026-12-31' },
          ],
          weekStartsOn: 1,
        },
      }
      expectOk(t)
      t.blocks[i].props.periods[1].end = '2026-08-01' // 끝이 시작보다 앞
      expectBad(t)
      t.blocks[i].props.periods = []
      expectBad(t)
      t.blocks[i] = {
        ...t.blocks[i],
        type: 'clock',
        props: { face: 'analog', hour12: true, showDate: false },
      }
      expectOk(t)
      t.blocks[i].props.face = 'flip'
      expectBad(t)
    })

    it('디데이 블록: eventId(null 또는 UUID)만, 크기는 S/M', () => {
      const t = baseTheme()
      const i = t.blocks.findIndex((b: { type: string }) => b.type === 'todo')
      t.blocks[i] = { ...t.blocks[i], type: 'dday', size: 'M', props: { eventId: null } }
      expectOk(t)
      t.blocks[i].props = { eventId: U(900) }
      expectOk(t)
      t.blocks[i].props = {}
      expectBad(t)
      t.blocks[i].props = { eventId: 'x' }
      expectBad(t)
      t.blocks[i].props = { eventId: null, title: '시험' }
      expectBad(t)
      t.blocks[i].props = { eventId: null }
      t.blocks[i].size = 'S'
      expectOk(t)
      t.blocks[i].size = 'L'
      expectBad(t, '쓸 수 없음')
    })

    it('배너(W)는 image 전용', () => {
      const t = baseTheme()
      t.blocks[2].size = 'W'
      expectBad(t, '쓸 수 없음')
    })
  })

  describe('에셋', () => {
    it('없는 에셋 참조 거부', () => {
      const t = baseTheme()
      t.blocks[1].props.assetHash = H('d')
      expectBad(t, '없는 에셋')
    })
    it('펫 이미지가 PNG가 아니면 거부', () => {
      const t = baseTheme()
      t.assets[1].mime = 'image/jpeg'
      expectBad(t, 'PNG')
    })
    it('에셋 해시 중복 거부', () => {
      const t = baseTheme()
      t.assets.push({ ...t.assets[0] })
      expectBad(t, '중복')
    })
    it('SVG 거부', () => {
      const t = baseTheme()
      t.assets[0].mime = 'image/svg+xml'
      expectBad(t)
    })
  })

  describe('미지의 키', () => {
    it('style의 원시 CSS 거부', () => {
      const t = baseTheme()
      t.blocks[0].style.css = 'x'
      expectBad(t)
    })
    it('props의 미지 키(html) 거부', () => {
      const t = baseTheme()
      t.blocks[0].props.html = '<script>'
      expectBad(t)
    })
  })

  describe('자유 아이템과 ID', () => {
    it('캔버스 밖 자유 아이템 거부', () => {
      const t = baseTheme()
      t.freeItems[0].x = 5000
      expectBad(t, '캔버스 밖')
    })
    it('캔버스에 일부만 걸친 아이템은 허용', () => {
      const t = baseTheme()
      t.freeItems[0].x = -100
      expectOk(t)
    })
    it('블록과 자유 아이템 사이 ID 중복 거부, 경로는 freeItems를 가리킨다', () => {
      const t = baseTheme()
      t.freeItems[0].id = U(2)
      const r = parseTheme(t)
      expect(r.success).toBe(false)
      const dup = r.success ? undefined : r.error.issues.find((i) => i.message.includes('중복'))
      expect(dup?.path).toEqual(['freeItems', 0, 'id'])
    })
  })

  it('기본 펫 허용', () => {
    const t = baseTheme()
    t.pet.source = { type: 'builtin', builtinId: 'default' }
    expectOk(t)
  })
})

describe('blockRect', () => {
  it('타입별 크기표로 사각형을 만든다', () => {
    expect(blockRect({ type: 'timer', col: 1, row: 2, size: 'S' })).toEqual({
      col: 1,
      row: 2,
      w: 2,
      h: 1,
    })
    expect(blockRect({ type: 'todo', col: 1, row: 2, size: 'S' })).toEqual({
      col: 1,
      row: 2,
      w: 2,
      h: 2,
    })
    expect(blockRect({ type: 'todo', col: 4, row: 1, size: 'M' })).toEqual({
      col: 4,
      row: 1,
      w: 2,
      h: 3,
    })
    expect(blockRect({ type: 'memo', col: 4, row: 1, size: 'L' })).toEqual({
      col: 4,
      row: 1,
      w: 4,
      h: 3,
    })
    expect(blockRect({ type: 'image', col: 0, row: 0, size: 'W' })).toEqual({
      col: 0,
      row: 0,
      w: 8,
      h: 1,
    })
  })
  it('허용되지 않는 조합은 null', () => {
    expect(blockRect({ type: 'calendar', col: 0, row: 0, size: 'S' })).toBeNull()
    expect(blockRect({ type: 'todo', col: 0, row: 0, size: 'W' })).toBeNull()
    expect(blockRect({ type: 'memo', col: 0, row: 0, size: 'W' })).toBeNull()
  })
})

describe('이미지의 직접 지정한 칸 수', () => {
  const theme = (span: unknown) => {
    const t = baseTheme()
    const image = t.blocks.find((b: { type: string }) => b.type === 'image')!
    t.blocks = [{ ...image, col: 0, row: 0, size: 'S', span }]
    return t
  }
  it('1×1, 3×2, 8×5를 저장하고 실제 칸 수를 사용한다', () => {
    for (const span of [
      { w: 1, h: 1 },
      { w: 3, h: 2 },
      { w: 8, h: 5 },
    ]) {
      const t = theme(span)
      expectOk(t)
      expect(blockRect(t.blocks[0])).toEqual({ col: 0, row: 0, ...span })
    }
    expectOk(baseTheme())
  })
  it('소수·음수·초과·알 수 없는 키 및 이미지 이외의 span을 거부한다', () => {
    for (const span of [
      { w: 0, h: 1 },
      { w: 9, h: 1 },
      { w: 1, h: 6 },
      { w: 1.5, h: 1 },
      { w: 2, h: 2, px: 300 },
    ])
      expectBad(theme(span))
    const t = baseTheme()
    t.blocks[0].span = { w: 1, h: 1 }
    expectBad(t)
  })
  it('새 칸 수로 보드 밖/다른 블록과의 겹침을 검사한다', () => {
    const t = theme({ w: 3, h: 2 })
    t.blocks[0].col = 6
    expectBad(t, '범위')
    t.blocks[0].col = 0
    t.blocks.push({ ...t.blocks[0], id: U(987), col: 2 })
    expectBad(t, '겹침')
  })
})
