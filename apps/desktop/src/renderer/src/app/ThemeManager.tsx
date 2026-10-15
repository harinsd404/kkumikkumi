import { useState } from 'react'
import type { ThemeSummary } from '../../../shared/api'
import { Dots } from './ThemeDialog'
import { lookOfSummary } from './themeLook'
import { ModalBackdrop } from './Modal'

type OkSummary = Extract<ThemeSummary, { ok: true }>

export interface ThemeManagerActions {
  onSelect(id: string): void
  onEdit(id: string): void
  onCreate(): void
  /** 실패하면 보여 줄 문구 */
  onRename(id: string, name: string): Promise<string | null>
  onDuplicate(id: string): Promise<string | null>
  onDelete(id: string): Promise<string | null>
  onReset(id: string): Promise<string | null>
}

/**
 * 테마 관리 창: 기본 테마(되돌리기만)와 내 테마(이름 바꾸기, 삭제)를 나눠 보여 준다.
 * 지우기와 되돌리기는 같은 줄에서 한 번 더 확인한다.
 */
export function ThemeManager({
  list,
  currentId,
  actions,
  onClose,
}: {
  list: readonly ThemeSummary[]
  currentId: string
  actions: ThemeManagerActions
  onClose(): void
}) {
  const [renaming, setRenaming] = useState<{ id: string; text: string } | null>(null)
  const [confirm, setConfirm] = useState<{ id: string; kind: 'delete' | 'reset' } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /** Escape/바깥 누르기: 이름 바꾸기나 확인 중이면 그것만 취소 */
  const dismiss = () => {
    if (renaming || confirm) {
      setRenaming(null)
      setConfirm(null)
    } else onClose()
  }

  const ok = list.filter((s): s is OkSummary => s.ok)
  const builtins = ok.filter((s) => s.builtin)
  const mine = ok.filter((s) => !s.builtin)
  const broken = list.filter((s) => !s.ok)

  const run = async (p: Promise<string | null>) => {
    setBusy(true)
    setError(null)
    const err = await p
    setBusy(false)
    if (err) setError(err)
    return err === null
  }

  const commitRename = async () => {
    if (!renaming) return
    const s = ok.find((x) => x.id === renaming.id)
    const text = renaming.text.trim()
    if (!s || text === '' || text === s.name) return setRenaming(null)
    if (ok.some((x) => x.id !== s.id && x.name === text))
      return setError('같은 이름의 테마가 있어요')
    if (await run(actions.onRename(s.id, text))) setRenaming(null)
  }

  const row = (s: OkSummary) => {
    const current = s.id === currentId
    const asking = confirm?.id === s.id ? confirm.kind : null
    return (
      <li key={s.id} className={`tm-row ${current ? 'is-current' : ''}`}>
        <Dots look={lookOfSummary(s)} />
        {renaming?.id === s.id ? (
          <input
            className="tm-name-input"
            aria-label="새 이름"
            value={renaming.text}
            maxLength={40}
            autoFocus
            onChange={(e) => setRenaming({ id: s.id, text: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) void commitRename()
              if (e.key === 'Escape') {
                e.stopPropagation()
                setRenaming(null)
              }
            }}
            onBlur={() => void commitRename()}
          />
        ) : (
          <button
            type="button"
            className="tm-name"
            disabled={current || busy}
            onClick={() => actions.onSelect(s.id)}
            title={current ? '지금 쓰는 테마' : '이 테마로 바꾸기'}
          >
            {s.name}
            {current && <span className="tm-tag">사용 중</span>}
          </button>
        )}
        {asking ? (
          <span className="tm-confirm" role="group" aria-label="확인">
            <span>{asking === 'delete' ? '지울까요?' : '처음 상태로 되돌릴까요?'}</span>
            <button
              type="button"
              className="is-danger"
              disabled={busy}
              onClick={() =>
                void (async () => {
                  const p = asking === 'delete' ? actions.onDelete(s.id) : actions.onReset(s.id)
                  if (await run(p)) setConfirm(null)
                })()
              }
            >
              {asking === 'delete' ? '지우기' : '되돌리기'}
            </button>
            <button type="button" disabled={busy} onClick={() => setConfirm(null)}>
              취소
            </button>
          </span>
        ) : (
          <span className="tm-actions">
            <button type="button" disabled={busy} onClick={() => actions.onEdit(s.id)}>
              색·글꼴
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void run(actions.onDuplicate(s.id))}
            >
              복제
            </button>
            {s.builtin ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirm({ id: s.id, kind: 'reset' })}
              >
                되돌리기
              </button>
            ) : (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setRenaming({ id: s.id, text: s.name })}
                >
                  이름
                </button>
                <button
                  type="button"
                  className="is-danger"
                  disabled={busy}
                  onClick={() => setConfirm({ id: s.id, kind: 'delete' })}
                >
                  삭제
                </button>
              </>
            )}
          </span>
        )}
      </li>
    )
  }

  return (
    <ModalBackdrop onClose={dismiss} busy={busy}>
      <div className="dlg tm" role="dialog" aria-modal="true" aria-labelledby="tm-title">
        <h2 id="tm-title" className="td-title">
          테마 관리
        </h2>
        <section className="td-section">
          <h3>기본 테마</h3>
          <p className="td-note">
            이름을 바꾸거나 지울 수 없고, 언제든 처음 상태로 되돌릴 수 있어요.
          </p>
          <ul className="tm-list">{builtins.map(row)}</ul>
        </section>
        <section className="td-section">
          <h3>내 테마</h3>
          {mine.length === 0 ? (
            <p className="td-note">아직 없어요. 새 테마를 만들거나 기본 테마를 복제해 보세요.</p>
          ) : (
            <ul className="tm-list">{mine.map(row)}</ul>
          )}
          {broken.length > 0 && (
            <p className="td-note">읽을 수 없는 테마 {broken.length}개는 목록에서 뺐어요.</p>
          )}
        </section>
        {error && (
          <p className="dlg-error" role="alert">
            {error}
          </p>
        )}
        <div className="dlg-actions">
          <button type="button" onClick={actions.onCreate} disabled={busy}>
            + 새 테마 만들기
          </button>
          <span className="dlg-spacer" />
          <button type="button" className="is-primary" onClick={onClose} disabled={busy}>
            닫기
          </button>
        </div>
      </div>
    </ModalBackdrop>
  )
}
