import type { McpMode } from '@kkumikkumi/schema'
import { useEffect, useState } from 'react'
import type { McpStatus } from '../../../../shared/api'

// 설정 페이지 "AI 연결"(MCP): 끄기/읽기만/읽기·쓰기, 그리고 AI 앱에 붙여 넣을 설정.

const MODES: { value: McpMode; label: string }[] = [
  { value: 'off', label: '끄기' },
  { value: 'read', label: '읽기만' },
  { value: 'readwrite', label: '읽기·쓰기' },
]

const ERROR_TEXT: Record<NonNullable<McpStatus['error']>, string> = {
  path_too_long: '데이터 폴더 경로가 너무 길어 연결을 열 수 없어요.',
  listen_failed: '연결을 열지 못했어요. 앱을 다시 시작해 보세요.',
}

/** TOML/셸 문자열(경로에 공백이 있어도 되게) */
const quote = (s: string) => JSON.stringify(s)

export function mcpSnippets(socketPath: string) {
  const p = quote(socketPath)
  return [
    {
      id: 'codex',
      label: 'Codex (~/.codex/config.toml)',
      text: `[mcp_servers.kkumikkumi]\ncommand = "/usr/bin/nc"\nargs = ["-U", ${p}]`,
    },
    {
      id: 'codex-cli',
      label: 'Codex 명령으로 추가',
      text: `codex mcp add kkumikkumi -- /usr/bin/nc -U ${p}`,
    },
    {
      id: 'claude',
      label: 'Claude Code 명령으로 추가',
      text: `claude mcp add kkumikkumi -- /usr/bin/nc -U ${p}`,
    },
  ]
}

export function McpSection({ highlight = false }: { highlight?: boolean }) {
  const [status, setStatus] = useState<McpStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      const r = await window.kkumi.invoke('mcp.status')
      if (r.ok) setStatus(r.value)
      else setError('설정을 불러오지 못했어요')
    })()
  }, [])

  const choose = async (mode: McpMode) => {
    if (!status || mode === status.mode) return
    setBusy(true)
    setError(null)
    setCopied(null)
    const r = await window.kkumi.invoke('mcp.update', { mode })
    setBusy(false)
    if (r.ok) setStatus(r.value)
    else setError('설정을 바꾸지 못했어요')
  }

  const copy = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(id)
    } catch {
      setError('복사하지 못했어요. 직접 골라서 복사해 주세요.')
    }
  }

  const on = status !== null && status.mode !== 'off'

  return (
    <section
      id="settings-mcp"
      className={`pg-card st-card ${highlight ? 'is-highlight' : ''}`}
      aria-labelledby="st-mcp"
    >
      <h2 id="st-mcp" className="pg-chip">
        AI 연결
      </h2>
      <p className="st-note">
        Codex, Claude Code처럼 MCP를 지원하는 AI 앱이 꾸미꾸미의 할 일, 일정, 메모, 시간표, 타이머를
        읽고(읽기·쓰기면 추가·수정·삭제도) 할 수 있어요. 꾸미꾸미가 켜져 있을 때만 연결돼요.
      </p>
      <div className="pg-tabs" role="radiogroup" aria-label="AI 연결 방식">
        {MODES.map((m) => (
          <button
            key={m.value}
            type="button"
            role="radio"
            aria-checked={status?.mode === m.value}
            className="pg-pill"
            disabled={!status || busy}
            onClick={() => void choose(m.value)}
          >
            {m.label}
          </button>
        ))}
      </div>
      {on && (
        <p className="st-warn">
          연결한 AI 앱이 읽은 내용은 그 AI 서비스로 보내져요. 모드를 바꾸면 이미 연결된 AI 앱은
          끊기니 AI 앱에서 다시 연결해 주세요.
        </p>
      )}
      {status?.error && <p className="st-error">{ERROR_TEXT[status.error]}</p>}
      {on && status.listening && (
        <div className="st-snippets">
          {mcpSnippets(status.socketPath).map((s) => (
            <div key={s.id} className="st-snippet">
              <div className="st-snippet-head">
                <span>{s.label}</span>
                <button type="button" className="pg-pill" onClick={() => void copy(s.id, s.text)}>
                  {copied === s.id ? '복사됨' : '복사'}
                </button>
              </div>
              <pre>{s.text}</pre>
            </div>
          ))}
        </div>
      )}
      {error && <p className="st-error">{error}</p>}
    </section>
  )
}
