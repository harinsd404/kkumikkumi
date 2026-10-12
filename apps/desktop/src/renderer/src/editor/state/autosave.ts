/**
 * 디바운스 자동 저장(순수 로직 + 주입된 타이머). 저장은 한 번에 하나만, 저장 중 들어온 변경은 끝난 뒤 최신 것만 저장.
 * validate가 실패하면 저장하지 않고 상태를 'invalid'로 둔다.
 */
export type SaveStatus =
  | { state: 'idle' }
  | { state: 'pending' }
  | { state: 'saving' }
  | { state: 'saved'; at: number }
  | { state: 'invalid'; message: string }
  | { state: 'error'; code: string }

export interface AutosaveDeps<T> {
  delayMs: number
  validate(value: T): string | null
  save(value: T): Promise<{ ok: true } | { ok: false; code: string }>
  onStatus(s: SaveStatus): void
  now(): number
  setTimer(fn: () => void, ms: number): unknown
  clearTimer(handle: unknown): void
}

export interface Autosaver<T> {
  schedule(value: T): void
  /** 대기 중인 변경을 즉시 저장하고 끝날 때까지 기다린다 */
  flush(): Promise<void>
  dispose(): void
}

export function createAutosaver<T>(d: AutosaveDeps<T>): Autosaver<T> {
  let latest: { value: T } | null = null
  let timer: unknown = null
  let running: Promise<void> | null = null

  const run = async (): Promise<void> => {
    while (latest) {
      const { value } = latest
      latest = null
      const problem = d.validate(value)
      if (problem) {
        d.onStatus({ state: 'invalid', message: problem })
        continue
      }
      d.onStatus({ state: 'saving' })
      try {
        const r = await d.save(value)
        if (!latest)
          d.onStatus(r.ok ? { state: 'saved', at: d.now() } : { state: 'error', code: r.code })
      } catch {
        if (!latest) d.onStatus({ state: 'error', code: 'internal' })
      }
    }
  }

  const start = () => {
    if (timer !== null) {
      d.clearTimer(timer)
      timer = null
    }
    if (!running) {
      running = run().finally(() => {
        running = null
      })
    }
    return running
  }

  return {
    schedule(value) {
      latest = { value }
      d.onStatus({ state: 'pending' })
      if (timer !== null) d.clearTimer(timer)
      timer = d.setTimer(() => {
        timer = null
        void start()
      }, d.delayMs)
    },
    async flush() {
      if (latest) await start()
      else if (running) await running
      // 저장 중에 새 변경이 들어왔으면 그것까지
      if (latest) await start()
    },
    dispose() {
      if (timer !== null) d.clearTimer(timer)
      timer = null
    },
  }
}
