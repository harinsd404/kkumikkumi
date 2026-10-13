import { MEMO_MAX_CHARS, type Memo } from '@kkumikkumi/schema'
import { useEffect, useRef, useState } from 'react'
import './pages.css'
import { localDate } from '../board/calendar'
import { MemoView } from '../board/MemoView'
import {
  continueList,
  matchesMemo,
  memoPreview,
  memoTitle,
  toggleBold,
  toggleLineFormat,
  type TextEdit,
} from '../board/memoFormat'
import type { MemoStore } from '../app/useMemos'

interface Props {
  store: MemoStore
  /** 처음 열 메모(블록에서 들어온 경우) */
  initialId?: string | null
  now: Date
}

const UNTITLED = '새 메모'

/** 같은 날이면 시각, 올해면 월/일, 아니면 연도까지 */
function updatedLabel(ms: number, now: Date): string {
  const d = new Date(ms)
  if (localDate(ms) === localDate(now.getTime()))
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  if (d.getFullYear() === now.getFullYear()) return `${d.getMonth() + 1}/${d.getDate()}`
  return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}`
}

/** 메모 세부 페이지: 메모 목록(검색/고정) / 편집기(서식 버튼, 편집·보기) */
export function MemoPage({ store, initialId, now }: Props) {
  const [picked, setPicked] = useState<string | null>(initialId ?? null)
  const [query, setQuery] = useState('')
  const memos = store.memos
  if (!memos) return <div className="pg" />

  const shown = memos.filter((m) => matchesMemo(m.body, query))
  // 지워졌거나 고른 적이 없으면 맨 위 메모
  const current = memos.find((m) => m.id === picked) ?? memos[0]

  const create = async () => {
    const m = await store.create()
    if (m) {
      setQuery('')
      setPicked(m.id)
    }
  }

  return (
    <div className="pg pg-memo">
      <nav className="pg-card pg-side" aria-label="메모 목록">
        <div className="mp-side-head">
          <h2 className="pg-chip">메모</h2>
          <button type="button" className="pg-pill is-filled" onClick={() => void create()}>
            + 새 메모
          </button>
        </div>
        <input
          className="pg-input"
          type="search"
          placeholder="검색"
          aria-label="메모 검색"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {shown.length === 0 ? (
          <p className="pg-empty">{query.trim() ? '찾는 메모가 없어요' : '메모가 없어요'}</p>
        ) : (
          <ul className="pg-lists mp-list">
            {shown.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  className="pg-list-btn mp-item"
                  aria-current={m.id === current?.id}
                  onClick={() => setPicked(m.id)}
                >
                  <span className="mp-item-top">
                    <span className="pg-list-name">{memoTitle(m.body) || UNTITLED}</span>
                    {m.pinned && <span className="mp-pin">고정</span>}
                  </span>
                  <span className="mp-item-sub">
                    <span className="mp-item-date">{updatedLabel(m.updatedAt, now)}</span>
                    <span className="mp-item-preview">{memoPreview(m.body)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </nav>

      <section className="pg-card mp-main" aria-label="메모">
        {current ? (
          <MemoEditor key={current.id} memo={current} store={store} now={now} />
        ) : (
          <div className="mp-empty">
            <p className="pg-empty">아직 메모가 없어요</p>
            <button type="button" className="pg-pill is-filled" onClick={() => void create()}>
              첫 메모 만들기
            </button>
          </div>
        )}
      </section>
    </div>
  )
}

const TOOLS: { label: string; title: string; run(t: TextEdit): TextEdit }[] = [
  { label: '제목', title: '제목 (# )', run: (t) => toggleLineFormat(t, 'heading') },
  { label: '굵게', title: '굵게 (**글자**)', run: toggleBold },
  { label: '목록', title: '글머리표 (- )', run: (t) => toggleLineFormat(t, 'bullet') },
  { label: '체크', title: '체크리스트 (- [ ] )', run: (t) => toggleLineFormat(t, 'check') },
]

/**
 * 입력칸의 글을 바꾼다. 바뀐 부분만 execCommand로 넣어 실행 취소(⌘Z)가 이어지게 하고,
 * 안 되면 값을 직접 바꾼다.
 */
function replaceText(ta: HTMLTextAreaElement, next: TextEdit) {
  const old = ta.value
  let p = 0
  while (p < old.length && p < next.text.length && old[p] === next.text[p]) p++
  let q = 0
  while (
    q < old.length - p &&
    q < next.text.length - p &&
    old[old.length - 1 - q] === next.text[next.text.length - 1 - q]
  )
    q++
  const insert = next.text.slice(p, next.text.length - q)
  ta.focus()
  ta.setSelectionRange(p, old.length - q)
  const ok = insert
    ? document.execCommand('insertText', false, insert)
    : p === old.length - q || document.execCommand('delete')
  if (!ok || ta.value !== next.text) ta.value = next.text
  ta.setSelectionRange(next.selStart, next.selEnd)
}

function MemoEditor({ memo, store, now }: { memo: Memo; store: MemoStore; now: Date }) {
  const [mode, setMode] = useState<'edit' | 'view'>(() => (memo.body.trim() ? 'view' : 'edit'))
  const [confirmDelete, setConfirmDelete] = useState(false)
  const ta = useRef<HTMLTextAreaElement>(null)
  const id = memo.id
  const { edit } = store

  useEffect(() => {
    const el = ta.current
    if (mode !== 'edit' || !el) return
    el.focus()
    // 목록 줄에서 Enter → 다음 줄에 같은 표시. 한글 조합이 끝난 뒤의 줄바꿈(beforeinput)에서 처리한다.
    const onBefore = (e: InputEvent) => {
      if (e.inputType !== 'insertLineBreak' || e.isComposing) return
      if (el.selectionStart !== el.selectionEnd) return
      const r = continueList(el.value, el.selectionStart)
      if (!r) return
      e.preventDefault()
      replaceText(el, r)
      edit(id, el.value)
    }
    el.addEventListener('beforeinput', onBefore)
    return () => el.removeEventListener('beforeinput', onBefore)
  }, [mode, id, edit])

  const apply = (run: (t: TextEdit) => TextEdit) => {
    const el = ta.current
    if (!el) return
    replaceText(el, run({ text: el.value, selStart: el.selectionStart, selEnd: el.selectionEnd }))
    edit(id, el.value)
  }

  return (
    <>
      <header className="mp-head">
        <div className="pg-tabs" role="tablist" aria-label="보기 방식">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'edit'}
            className="pg-pill"
            onClick={() => setMode('edit')}
          >
            편집
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'view'}
            className="pg-pill"
            onClick={() => setMode('view')}
          >
            보기
          </button>
        </div>
        {mode === 'edit' && (
          <div className="mp-tools" role="toolbar" aria-label="서식">
            {TOOLS.map((t) => (
              <button
                key={t.label}
                type="button"
                className="mp-tool"
                title={t.title}
                // 누를 때 입력칸 선택이 풀리지 않게
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => apply(t.run)}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}
        <span className="pg-spacer" />
        <span className="mp-date">{updatedLabel(memo.updatedAt, now)} 수정</span>
        <button
          type="button"
          className="pg-pill"
          aria-pressed={memo.pinned}
          onClick={() => void store.setPinned(id, !memo.pinned)}
        >
          {memo.pinned ? '고정 해제' : '고정'}
        </button>
        <button
          type="button"
          className="pg-pill is-danger"
          onClick={() => {
            if (!confirmDelete) return setConfirmDelete(true)
            void store.remove(id)
          }}
          onBlur={() => setConfirmDelete(false)}
        >
          {confirmDelete ? '정말 삭제' : '삭제'}
        </button>
      </header>

      {mode === 'edit' ? (
        <textarea
          ref={ta}
          className="mp-text"
          aria-label="메모 내용"
          defaultValue={memo.body}
          maxLength={MEMO_MAX_CHARS}
          spellCheck={false}
          placeholder={'# 제목\n- 목록\n- [ ] 체크리스트\n**굵게** ~~취소선~~'}
          onChange={(e) => edit(id, e.target.value)}
        />
      ) : memo.body.trim() ? (
        <div
          className="mp-view"
          onDoubleClick={(e) => {
            // 체크 칸을 빠르게 두 번 누른 건 편집 전환이 아니다
            if (!(e.target as Element).closest('button')) setMode('edit')
          }}
        >
          <MemoView body={memo.body} onToggle={(line) => store.toggle(id, line)} />
        </div>
      ) : (
        <button type="button" className="mp-view mp-view-empty" onClick={() => setMode('edit')}>
          비어 있어요. 눌러서 쓰기
        </button>
      )}
    </>
  )
}
