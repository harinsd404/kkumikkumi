import { describe, expect, it } from 'vitest'
import {
  checkProgress,
  continueList,
  matchesMemo,
  memoPreview,
  memoTitle,
  parseInline,
  parseMemo,
  sortMemos,
  toggleBold,
  toggleCheck,
  toggleLineFormat,
} from '../memoFormat'

const s = (text: string, bold = false, strike = false) => ({ text, bold, strike })
/** "|"로 선택(두 개) 또는 커서(하나)를 표시한 문자열 → TextEdit */
const at = (marked: string) => {
  const a = marked.indexOf('|')
  const b = marked.indexOf('|', a + 1)
  const text = marked.replaceAll('|', '')
  return { text, selStart: a, selEnd: b === -1 ? a : b - 1 }
}
const show = (t: { text: string; selStart: number; selEnd: number }) =>
  t.selStart === t.selEnd
    ? t.text.slice(0, t.selStart) + '|' + t.text.slice(t.selStart)
    : t.text.slice(0, t.selStart) +
      '|' +
      t.text.slice(t.selStart, t.selEnd) +
      '|' +
      t.text.slice(t.selEnd)

describe('parseInline', () => {
  it('굵게/취소선, 겹침', () => {
    expect(parseInline('a **b** c')).toEqual([s('a '), s('b', true), s(' c')])
    expect(parseInline('~~x~~')).toEqual([s('x', false, true)])
    expect(parseInline('**a ~~b~~**')).toEqual([s('a ', true), s('b', true, true)])
  })

  it('짝이 없거나 빈 표시는 글자로 남는다', () => {
    expect(parseInline('2 ** 3')).toEqual([s('2 ** 3')])
    expect(parseInline('**a** **b')).toEqual([s('a', true), s(' **b')])
    expect(parseInline('****')).toEqual([s('****')])
    expect(parseInline('**** **x**')).toEqual([s('**** '), s('x', true)])
  })

  it('HTML/링크는 해석하지 않고 그대로 글자', () => {
    expect(parseInline('<img src=x onerror=1> [a](http://x)')).toEqual([
      s('<img src=x onerror=1> [a](http://x)'),
    ])
  })
})

describe('parseMemo', () => {
  it('줄 종류와 줄 번호', () => {
    const lines = parseMemo(
      '# 제목\n## 소제목\n- 하나\n  * 둘\n3. 셋\n- [ ] 할 것\n- [x] 한 것\n\n그냥 글',
    )
    expect(lines.map((l) => l.kind)).toEqual([
      'heading',
      'heading',
      'bullet',
      'bullet',
      'ordered',
      'check',
      'check',
      'blank',
      'text',
    ])
    expect(lines[1]).toMatchObject({ level: 2 })
    expect(lines[3]).toMatchObject({ indent: 1, spans: [s('둘')] })
    expect(lines[4]).toMatchObject({ n: 3 })
    expect(lines[5]).toMatchObject({ checked: false, line: 5 })
    expect(lines[6]).toMatchObject({ checked: true })
  })

  it('표시 뒤에 띄어쓰기가 없으면 일반 글', () => {
    expect(parseMemo('#해시태그\n-1도\n1.5배').map((l) => l.kind)).toEqual(['text', 'text', 'text'])
    expect(parseMemo('### 셋')[0]!.kind).toBe('text')
  })

  it('들여쓰기는 3단계까지, CRLF 허용', () => {
    expect(parseMemo('          - 깊음')[0]).toMatchObject({ indent: 3 })
    expect(parseMemo('- a\r\n- [ ] b')[1]).toMatchObject({ kind: 'check', spans: [s('b')] })
  })

  it('빈 체크 항목', () => {
    expect(parseMemo('- [ ]')[0]).toMatchObject({ kind: 'check', spans: [] })
  })
})

describe('제목/미리보기/진행/검색', () => {
  it('서식 표시를 뺀 첫 줄과 다음 줄', () => {
    const body = '\n\n# **장보기**\n\n- [ ] 우유\n- [x] 빵'
    expect(memoTitle(body)).toBe('장보기')
    expect(memoPreview(body)).toBe('우유')
    expect(memoTitle('')).toBe('')
    expect(memoPreview('한 줄')).toBe('')
    expect(memoTitle('가'.repeat(100))).toHaveLength(60)
  })

  it('체크 진행과 검색', () => {
    expect(checkProgress('- [ ] a\n- [x] b\n- [X] c\n- d')).toEqual([2, 3])
    expect(matchesMemo('Hello 메모', 'hello')).toBe(true)
    expect(matchesMemo('abc', '  ')).toBe(true)
    expect(matchesMemo('abc', 'z')).toBe(false)
  })
})

describe('toggleCheck', () => {
  it('해당 줄만 바꾸고 나머지는 그대로', () => {
    const body = '# t\r\n- [ ] a\n  * [x] b'
    expect(toggleCheck(body, 1)).toBe('# t\r\n- [x] a\n  * [x] b')
    expect(toggleCheck(body, 2)).toBe('# t\r\n- [ ] a\n  * [ ] b')
  })

  it('체크 줄이 아니거나 범위 밖이면 그대로', () => {
    expect(toggleCheck('- a', 0)).toBe('- a')
    expect(toggleCheck('- [ ] a', 5)).toBe('- [ ] a')
  })
})

describe('toggleLineFormat', () => {
  it('한 줄: 켜기/끄기, 커서 유지', () => {
    expect(show(toggleLineFormat(at('우|유'), 'check'))).toBe('- [ ] 우|유')
    expect(show(toggleLineFormat(at('- [ ] 우|유'), 'check'))).toBe('우|유')
    expect(show(toggleLineFormat(at('- 우|유'), 'heading'))).toBe('# 우|유')
    expect(show(toggleLineFormat(at('# 제|목'), 'heading'))).toBe('제|목')
    expect(show(toggleLineFormat(at('- [ ] a|'), 'bullet'))).toBe('- a|')
  })

  it('여러 줄: 빈 줄은 두고, 모두 켜져 있으면 끈다', () => {
    expect(show(toggleLineFormat(at('|a\n\nb|\nc'), 'bullet'))).toBe('|- a\n\n- b|\nc')
    expect(show(toggleLineFormat(at('|- a\n- b|'), 'bullet'))).toBe('|a\nb|')
    // 다음 줄 맨 앞에서 끝난 선택은 그 줄을 포함하지 않는다
    expect(show(toggleLineFormat(at('x\n|a\n|b'), 'check'))).toBe('x\n|- [ ] a|\nb')
  })

  it('들여쓰기 유지', () => {
    expect(toggleLineFormat(at('  - a|'), 'check').text).toBe('  - [ ] a')
  })
})

describe('toggleBold', () => {
  it('감싸기/풀기/빈 선택', () => {
    expect(show(toggleBold(at('a |bc| d')))).toBe('a **|bc|** d')
    expect(show(toggleBold(at('a **|bc|** d')))).toBe('a |bc| d')
    expect(show(toggleBold(at('a |**bc**| d')))).toBe('a |bc| d')
    expect(show(toggleBold(at('a |')))).toBe('a **|**')
  })
})

describe('continueList', () => {
  it('같은 표시로 이어 쓰기, 번호 +1, 체크는 빈 칸', () => {
    expect(show(continueList('- a', 3)!)).toBe('- a\n- |')
    expect(show(continueList('  9. a\nz', 6)!)).toBe('  9. a\n  10. |\nz')
    expect(show(continueList('* [x] a', 7)!)).toBe('* [x] a\n* [ ] |')
  })

  it('빈 목록 줄이면 표시를 지우고, 목록이 아니면 null', () => {
    expect(show(continueList('- a\n- ', 6)!)).toBe('- a\n|')
    expect(show(continueList('- [ ] ', 6)!)).toBe('|')
    expect(continueList('그냥 글', 2)).toBeNull()
    expect(continueList('-a', 2)).toBeNull()
  })
})

describe('sortMemos', () => {
  it('고정 → 최근 수정 → 최근 생성', () => {
    const m = (id: string, pinned: boolean, updatedAt: number, createdAt = 0) => ({
      id,
      pinned,
      updatedAt,
      createdAt,
    })
    expect(
      sortMemos([m('a', false, 5), m('b', true, 1), m('c', false, 9), m('d', false, 5, 3)]).map(
        (x) => x.id,
      ),
    ).toEqual(['b', 'c', 'd', 'a'])
  })
})
