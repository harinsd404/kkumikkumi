import { useEffect, useState } from 'react'
import type { SyncStatus } from '../../../../shared/api'

const messages: Record<string, string> = {
  sync_upgrade: '시간표·일기·사진·테마까지 동기화하려면 아래에서 전체 동기화를 시작해 주세요.',
  sync_blob: '사진 파일을 확인하지 못했어요. 동기화를 다시 시도해 주세요.',
  sync_unsaved: '편집 중인 내용을 먼저 저장하고 다시 동기화해 주세요.',
  sync_url: 'HTTPS 주소를 입력해 주세요. SSH 터널은 http://127.0.0.1:8787을 사용할 수 있어요.',
  sync_auth: '접속키를 확인해 주세요.',
  sync_network: '서버에 연결하지 못했어요. 로컬 변경은 보관 중이에요.',
  sync_protocol: '서버와 앱 버전이 호환되지 않아요.',
  sync_server: '서버가 요청을 처리하지 못했어요.',
  sync_identity: '서버 또는 계정이 달라졌어요. 연결을 해제한 뒤 다시 확인해 주세요.',
  sync_rollback: '서버가 이전 데이터로 복구됐어요. 백업을 확인하고 다시 연결해 주세요.',
  sync_too_large: '동기화 데이터가 서버의 용량 제한을 넘었어요.',
  sync_conflict: '같은 항목을 두 기기에서 다르게 수정했어요. 유지할 내용을 선택해 주세요.',
  sync_secure_storage: '접속키를 안전하게 저장할 수 없어요. 운영체제의 키 저장소를 확인해 주세요.',
  sync_consent: '기존 데이터를 이 서버와 동기화할지 확인해 주세요.',
  sync_busy: '진행 중인 동기화가 끝난 뒤 다시 시도해 주세요.',
}
export function SyncSection() {
  const [status, setStatus] = useState<SyncStatus | null>(null)
  const [url, setUrl] = useState('')
  const [token, setToken] = useState('')
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let active = true
    const refresh = async (initial = false) => {
      const r = await window.kkumi.invoke('sync.status')
      if (active && r.ok) {
        setStatus(r.value)
        if (initial) setUrl(r.value.url)
      }
    }
    void refresh(true)
    const timer = setInterval(() => void refresh(), 3000)
    return () => {
      active = false
      clearInterval(timer)
    }
  }, [])
  const act = async (
    kind: 'connect' | 'disconnect' | 'run' | 'upgrade',
    prefer?: 'local' | 'remote',
  ) => {
    setBusy(true)
    setError(null)
    try {
      const r =
        kind === 'connect'
          ? await window.kkumi.invoke('sync.connect', {
              url,
              token: token.trim(),
              importLocal: consent,
            })
          : kind === 'disconnect'
            ? await window.kkumi.invoke('sync.disconnect')
            : await window.kkumi.invoke(
                'sync.run',
                kind === 'upgrade' ? { upgrade: consent } : prefer ? { prefer } : {},
              )
      if (r.ok) {
        setStatus(r.value)
        setToken('')
        setConsent(false)
      } else setError(r.error.code)
    } finally {
      setBusy(false)
    }
  }
  const locked = busy || !!status?.busy
  const issue = error ?? status?.error
  return (
    <section className="pg-card st-card" aria-labelledby="st-sync">
      <h2 id="st-sync" className="pg-chip">
        기기 간 동기화
      </h2>
      <p className="st-note">
        개인 서버로 할 일·메모·일정·시간표·습관·일기·타이머 기록·테마·사진과 공통 설정을 동기화해요.
        접속키·AI 연결 권한·창 위치·실행 중인 타이머는 기기별로 유지해요.
      </p>
      {status?.enabled ? (
        <>
          <p className="st-note">{status.url}</p>
          <p className="st-note" role="status">
            {status.busy ? '동기화 중…' : `대기 중인 변경 ${status.pending}개`}
            {status.lastSyncedAt
              ? ` · 마지막 동기화 ${new Date(status.lastSyncedAt).toLocaleString()}`
              : ''}
          </p>
          {status.requiresUpgrade && (
            <div>
              <label className="st-toggle">
                <input
                  type="checkbox"
                  checked={consent}
                  disabled={locked}
                  onChange={(e) => setConsent(e.target.checked)}
                />
                일기·사진을 포함한 전체 데이터를 이 서버와 동기화합니다.
              </label>
              <button
                className="pg-pill"
                type="button"
                disabled={locked || !consent}
                onClick={() => void act('upgrade')}
              >
                전체 동기화 시작
              </button>
            </div>
          )}
          <div className="pg-tabs">
            <button
              className="pg-pill"
              type="button"
              disabled={locked}
              onClick={() => void act('run')}
            >
              지금 동기화
            </button>
            <button
              className="pg-pill"
              type="button"
              disabled={locked}
              onClick={() => void act('disconnect')}
            >
              연결 해제
            </button>
          </div>
        </>
      ) : (
        <form
          className="st-sync-form"
          onSubmit={(e) => {
            e.preventDefault()
            void act('connect')
          }}
        >
          <label>
            서버 주소
            <input
              type="url"
              required
              value={url}
              placeholder="https://sync.example.com"
              disabled={locked}
              onChange={(e) => setUrl(e.target.value)}
            />
          </label>
          <label>
            접속키
            <input
              type="password"
              required
              autoComplete="off"
              value={token}
              disabled={locked}
              onChange={(e) => setToken(e.target.value)}
            />
          </label>
          <label className="st-toggle">
            <input
              type="checkbox"
              checked={consent}
              disabled={locked}
              onChange={(e) => setConsent(e.target.checked)}
            />
            일기·사진을 포함한 이 기기의 전체 데이터를 위 서버의 계정에 올리고, 서버의 데이터와 합쳐
            동기화합니다.
          </label>
          <button className="pg-pill" type="submit" disabled={locked || !consent || !status}>
            연결하기
          </button>
        </form>
      )}
      {issue && (
        <p className="st-error" role="alert">
          {messages[issue] ?? '동기화를 마치지 못했어요. 로컬 데이터는 유지돼요.'}
        </p>
      )}
      {!!status?.conflicts && (
        <div>
          <p className="st-note">
            충돌한 항목 {status.conflicts}개. 서로 다른 항목의 수정은 함께 유지돼요. 카테고리 삭제와
            할 일 수정이 겹치면 전체 묶음 중 하나를 선택해야 해요. 선택 전 두 내용은 데이터 폴더의
            sync-backups에 보관해요.
          </p>
          <div className="pg-tabs">
            <button
              className="pg-pill"
              type="button"
              disabled={locked}
              onClick={() => void act('run', 'local')}
            >
              이 기기 수정 유지
            </button>
            <button
              className="pg-pill"
              type="button"
              disabled={locked}
              onClick={() => void act('run', 'remote')}
            >
              서버 수정 유지
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
