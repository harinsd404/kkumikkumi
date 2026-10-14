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

    it('시간표 블록: props는 빈 객체만, 크기는 S/M/L', () => {
      const t = baseTheme()
      const i = t.blocks.findIndex((b: { type: string }) => b.type === 'todo')
      t.blocks[i] = { ...t.blocks[i], type: 'timetable', props: {} }
      expectOk(t)
      t.blocks[i].props = { entries: [] }
      expectBad(t)
      t.blocks[i].props = {}
      t.blocks[i].size = 'W'
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
