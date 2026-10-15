// 메모의 간단한 서식(마크다운 일부). 원문 텍스트만 저장하고, 여기서 줄 단위 구조로 바꿔 React 요소로 그린다.
// 지원: # 제목, ## 소제목, - / * 글머리표, 1. 번호, - [ ] / - [x] 체크리스트, **굵게**, ~~취소선~~.
// 링크/이미지/HTML은 지원하지 않는다(그대로 글자로 보인다).

export interface Span {
  text: string
  bold: boolean
  strike: boolean
}

interface LineBase {
  /** 원문에서의 줄 번호(0부터). 체크 토글에 쓴다. */
  line: number
}
export type MemoLine = LineBase &
  (
    | { kind: 'heading'; level: 1 | 2; spans: Span[] }
    | { kind: 'bullet'; indent: number; spans: Span[] }
    | { kind: 'ordered'; indent: number; n: number; spans: Span[] }
    | { kind: 'check'; indent: number; checked: boolean; spans: Span[] }
    | { kind: 'text'; spans: Span[] }
    | { kind: 'blank' }
  )

const MAX_INDENT = 3
const HEADING = /^(#{1,2}) +(.*)$/
const CHECK = /^( *)[-*] \[([ xX])\](?: (.*))?$/
const BULLET = /^( *)[-*] (.*)$/
const ORDERED = /^( *)(\d{1,4})[.)] (.*)$/

const indentOf = (spaces: string) => Math.min(MAX_INDENT, Math.floor(spaces.length / 2))

const splitLines = (body: string): string[] => body.split('\n').map((l) => l.replace(/\r$/, ''))

/** 한 줄 → 구조 */
function parseLine(raw: string, line: number): MemoLine {
  if (raw.trim() === '') return { kind: 'blank', line }
  let m = HEADING.exec(raw)
  if (m) return { kind: 'heading', level: m[1]!.length as 1 | 2, spans: parseInline(m[2]!), line }
  m = CHECK.exec(raw)
  if (m)
    return {
      kind: 'check',
      indent: indentOf(m[1]!),
      checked: m[2] !== ' ',
      spans: parseInline(m[3] ?? ''),
      line,
    }
  m = BULLET.exec(raw)
  if (m) return { kind: 'bullet', indent: indentOf(m[1]!), spans: parseInline(m[2]!), line }
  m = ORDERED.exec(raw)
  if (m)
    return {
      kind: 'ordered',
      indent: indentOf(m[1]!),
      n: Number(m[2]),
      spans: parseInline(m[3]!),
      line,
    }
  return { kind: 'text', spans: parseInline(raw), line }
}

export const parseMemo = (body: string): MemoLine[] => splitLines(body).map(parseLine)

/**
 * **굵게**, ~~취소선~~. 같은 표시는 왼쪽부터 둘씩 짝짓고, 짝이 없는 마지막 표시는 글자로 남긴다.
 * 내용이 빈 짝(****)도 글자로 남긴다.
 */
export function parseInline(text: string): Span[] {
  const marks: { at: number; kind: 'b' | 's' }[] = []
  for (let i = 0; i < text.length;) {
    if (text.startsWith('**', i)) {
      marks.push({ at: i, kind: 'b' })
      i += 2
    } else if (text.startsWith('~~', i)) {
      marks.push({ at: i, kind: 's' })
      i += 2
    } else i++
  }
  const toggles = new Set<number>()
  for (const kind of ['b', 's'] as const) {
    const ms = marks.filter((x) => x.kind === kind)
    for (let k = 0; k + 1 < ms.length; k += 2) {
      const open = ms[k]!.at
      const close = ms[k + 1]!.at
      // 빈 짝(****)은 둘 다 글자로
      if (close > open + 2) {
        toggles.add(open)
        toggles.add(close)
      }
    }
  }

  const spans: Span[] = []
  let bold = false
  let strike = false
  let buf = ''
  const push = () => {
    if (!buf) return
    const last = spans[spans.length - 1]
    if (last && last.bold === bold && last.strike === strike) last.text += buf
    else spans.push({ text: buf, bold, strike })
    buf = ''
  }
  for (let i = 0; i < text.length;) {
    if (toggles.has(i)) {
      push()
      if (text[i] === '*') bold = !bold
      else strike = !strike
      i += 2
    } else buf += text[i++]
  }
  push()
  return spans
}

const plain = (spans: readonly Span[]) => spans.map((s) => s.text).join('')

/** 목록/검색에 보일 제목: 내용이 있는 첫 줄의 글자(서식 표시 제외) */
export function memoTitle(body: string, max = 60): string {
  for (const l of parseMemo(body)) {
    if (l.kind === 'blank') continue
    const t = plain(l.spans).trim()
    if (t) return t.slice(0, max)
  }
  return ''
}

/** 제목 다음 줄의 미리보기 */
export function memoPreview(body: string, max = 80): string {
  let seenTitle = false
  for (const l of parseMemo(body)) {
    if (l.kind === 'blank') continue
    const t = plain(l.spans).trim()
    if (!t) continue
    if (!seenTitle) {
      seenTitle = true
      continue
    }
    return t.slice(0, max)
  }
  return ''
}

/** 체크리스트 진행: [완료, 전체] */
export function checkProgress(body: string): [number, number] {
  let done = 0
  let total = 0
  for (const l of parseMemo(body))
    if (l.kind === 'check') {
      total++
      if (l.checked) done++
    }
  return [done, total]
}

/** line번째 줄이 체크리스트면 [ ] ↔ [x]. 아니면 원문 그대로. */
export function toggleCheck(body: string, line: number): string {
  const lines = body.split('\n')
  const raw = lines[line]
  if (raw === undefined) return body
  const m = /^( *[-*] \[)([ xX])(\].*)$/s.exec(raw)
  if (!m) return body
  lines[line] = `${m[1]}${m[2] === ' ' ? 'x' : ' '}${m[3]}`
  return lines.join('\n')
}

export const matchesMemo = (body: string, query: string) => {
  const q = query.trim().toLowerCase()
  return !q || body.toLowerCase().includes(q)
}

/* ───────── 편집 도구(서식 버튼, Enter 이어 쓰기) ───────── */

export interface TextEdit {
  text: string
  selStart: number
  selEnd: number
}
export type LineFormat = 'heading' | 'bullet' | 'check'

const LIST_PREFIX = /^( *)(?:[-*] \[[ xX]\] |[-*] |\d{1,4}[.)] )/
const HEADING_PREFIX = /^#{1,2} +/

/** 선택이 걸친 줄 전체에 줄 서식을 켜거나 끈다(모든 줄에 이미 있으면 끈다). */
export function toggleLineFormat(t: TextEdit, f: LineFormat): TextEdit {
  const from = t.text.lastIndexOf('\n', t.selStart - 1) + 1
  const endNl = t.text.indexOf('\n', Math.max(t.selEnd - (t.selEnd > t.selStart ? 1 : 0), from))
  const to = endNl === -1 ? t.text.length : endNl
  const lines = t.text.slice(from, to).split('\n')

  const has = (l: string) =>
    f === 'heading'
      ? HEADING_PREFIX.test(l)
      : f === 'check'
        ? /^ *[-*] \[[ xX]\] /.test(l)
        : /^ *[-*] (?!\[[ xX]\] )/.test(l)
  // 여러 줄이면 빈 줄은 건드리지 않는다
  const skip = (l: string) => lines.length > 1 && l.trim() === ''
  const allOn = lines.every((l) => skip(l) || has(l))
  const strip = (l: string) => l.replace(HEADING_PREFIX, '').replace(LIST_PREFIX, '$1')
  const next = lines.map((l) => {
    if (skip(l)) return l
    if (allOn) return strip(l)
    const indent = /^ */.exec(l)![0]
    const body = strip(l).slice(f === 'heading' ? 0 : indent.length)
    return f === 'heading'
      ? `# ${strip(l).trimStart()}`
      : `${indent}${f === 'check' ? '- [ ] ' : '- '}${body}`
  })
  const replaced = next.join('\n')
  const text = t.text.slice(0, from) + replaced + t.text.slice(to)
  // 한 줄이고 선택이 없으면 커서를 줄 끝 기준으로 유지
  if (lines.length === 1 && t.selStart === t.selEnd) {
    const caret = Math.max(from, t.selStart + (replaced.length - (to - from)))
    return { text, selStart: caret, selEnd: caret }
  }
  return { text, selStart: from, selEnd: from + replaced.length }
}

/** 선택을 **로 감싸거나(이미 감싸져 있으면 푼다). 선택이 없으면 ****를 넣고 가운데에 커서. */
export function toggleBold(t: TextEdit): TextEdit {
  const { text, selStart: a, selEnd: b } = t
  if (a >= 2 && text.slice(a - 2, a) === '**' && text.slice(b, b + 2) === '**' && b > a)
    return {
      text: text.slice(0, a - 2) + text.slice(a, b) + text.slice(b + 2),
      selStart: a - 2,
      selEnd: b - 2,
    }
  const sel = text.slice(a, b)
  if (sel.length > 4 && sel.startsWith('**') && sel.endsWith('**'))
    return { text: text.slice(0, a) + sel.slice(2, -2) + text.slice(b), selStart: a, selEnd: b - 4 }
  return { text: `${text.slice(0, a)}**${sel}**${text.slice(b)}`, selStart: a + 2, selEnd: b + 2 }
}

/**
 * 목록 줄 끝에서 Enter: 다음 줄에 같은 표시를 이어 쓴다(번호는 +1, 체크는 빈 칸).
 * 내용 없는 목록 줄에서 Enter면 표시를 지운다. 목록 줄이 아니면 null(기본 동작).
 */
export function continueList(text: string, caret: number): TextEdit | null {
  const from = text.lastIndexOf('\n', caret - 1) + 1
  const nl = text.indexOf('\n', caret)
  const lineEnd = nl === -1 ? text.length : nl
  const before = text.slice(from, caret)
  const m = /^( *)([-*] \[[ xX]\] |[-*] |(\d{1,4})([.)]) )/.exec(before)
  if (!m) return null
  const rest = text.slice(from + m[0].length, lineEnd)
  if (before.length === m[0].length && rest.trim() === '') {
    // 빈 목록 줄 → 표시 지우기
    const out = text.slice(0, from) + text.slice(from + m[0].length)
    return { text: out, selStart: from, selEnd: from }
  }
  const marker = m[3]
    ? `${Number(m[3]) + 1}${m[4]} `
    : /\[[ xX]\]/.test(m[2]!)
      ? `${m[2]![0]} [ ] `
      : m[2]!
  const insert = `\n${m[1]}${marker}`
  const caretAfter = caret + insert.length
  return {
    text: text.slice(0, caret) + insert + text.slice(caret),
    selStart: caretAfter,
    selEnd: caretAfter,
  }
}

/** 목록 순서: 고정 먼저, 그다음 최근 수정, 최근 생성 */
export const sortMemos = <M extends { pinned: boolean; updatedAt: number; createdAt: number }>(
  ms: readonly M[],
): M[] =>
  [...ms].sort(
    (a, b) =>
      Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt || b.createdAt - a.createdAt,
  )
