import { Fragment, useMemo, type ReactNode } from 'react'
import checkUrl from './icons/check.svg'
import { parseMemo, type MemoLine, type Span } from './memoFormat'
import './memo.css'

interface Props {
  body: string
  /** 체크리스트 줄을 눌렀을 때(없으면 읽기 전용) */
  onToggle?(line: number): void
  /** 크기 기준(px). 블록은 논리 px, 페이지는 실제 px. */
  fontSize?: number
  className?: string
}

/** 메모 원문을 서식대로 그린다. 문자열은 React 텍스트로만 넣는다(HTML 해석 없음). */
export function MemoView({ body, onToggle, fontSize, className }: Props) {
  const lines = useMemo(() => parseMemo(body), [body])
  return (
    <div className={`mm ${className ?? ''}`} style={fontSize ? { fontSize } : undefined}>
      {lines.map((l) => (
        <Line key={l.line} l={l} onToggle={onToggle} />
      ))}
    </div>
  )
}

function Line({ l, onToggle }: { l: MemoLine; onToggle: Props['onToggle'] }) {
  const indent = 'indent' in l ? { paddingLeft: `${l.indent * 1.25}em` } : undefined
  switch (l.kind) {
    case 'blank':
      return <div className="mm-blank" />
    case 'heading':
      return (
        <div className={`mm-h${l.level}`} role="heading" aria-level={l.level}>
          <Spans spans={l.spans} />
        </div>
      )
    case 'bullet':
      return (
        <div className="mm-li" style={indent}>
          <span className="mm-mark" aria-hidden>
            •
          </span>
          <span className="mm-li-text">
            <Spans spans={l.spans} />
          </span>
        </div>
      )
    case 'ordered':
      return (
        <div className="mm-li" style={indent}>
          <span className="mm-mark mm-num" aria-hidden>
            {l.n}.
          </span>
          <span className="mm-li-text">
            <Spans spans={l.spans} />
          </span>
        </div>
      )
    case 'check': {
      const box = (
        <span className={`mm-box ${l.checked ? 'is-done' : ''}`} aria-hidden>
          {l.checked && <img src={checkUrl} alt="" draggable={false} />}
        </span>
      )
      const text = (
        <span className={`mm-li-text ${l.checked ? 'is-done' : ''}`}>
          <Spans spans={l.spans} />
        </span>
      )
      return onToggle ? (
        <button
          type="button"
          role="checkbox"
          aria-checked={l.checked}
          className="mm-li mm-check"
          style={indent}
          onClick={() => onToggle(l.line)}
        >
          {box}
          {text}
        </button>
      ) : (
        <div className="mm-li mm-check" style={indent} role="checkbox" aria-checked={l.checked}>
          {box}
          {text}
        </div>
      )
    }
    case 'text':
      return (
        <p className="mm-p">
          <Spans spans={l.spans} />
        </p>
      )
  }
}

function Spans({ spans }: { spans: readonly Span[] }): ReactNode {
  return spans.map((s, i) => {
    let node: ReactNode = s.text
    if (s.strike) node = <s>{node}</s>
    if (s.bold) node = <strong>{node}</strong>
    return <Fragment key={i}>{node}</Fragment>
  })
}
