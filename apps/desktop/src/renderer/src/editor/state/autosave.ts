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
  /** 대기/실패한 변경을 저장한다. 실패하면 false(변경은 다음 재시도를 위해 보존). */
  flush(): Promise<boolean>
  /** 타이머를 멈춘다. 대기 중인 변경은 버리지 않고 바로 저장을 시작한다(기다리지 않음). */
  dispose(): void
}

export function createAutosaver<T>(d: AutosaveDeps<T>): Autosaver<T> {
  let latest: { value: T } | null = null
  let failed: { value: T } | null = null
  let timer: unknown = null
  let running: Promise<void> | null = null

  const run = async (): Promise<void> => {
    while (latest) {
      const { value } = latest
      latest = null
      failed = null
      const problem = d.validate(value)
      if (problem) {
        failed = { value }
        d.onStatus({ state: 'invalid', message: problem })
        continue
      }
      d.onStatus({ state: 'saving' })
      try {
        const r = await d.save(value)
        if (!latest) {
          if (!r.ok) failed = { value }
          d.onStatus(r.ok ? { state: 'saved', at: d.now() } : { state: 'error', code: r.code })
        }
      } catch {
        if (!latest) {
          failed = { value }
          d.onStatus({ state: 'error', code: 'internal' })
        }
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
      failed = null
      d.onStatus({ state: 'pending' })
      if (timer !== null) d.clearTimer(timer)
      timer = d.setTimer(() => {
        timer = null
        void start()
      }, d.delayMs)
    },
    async flush() {
      if (!latest && !running && failed) {
        latest = failed
        failed = null
      }
      if (latest) await start()
      else if (running) await running
      // 저장 중에 새 변경이 들어왔으면 그것까지
      if (latest) await start()
      return failed === null
    },
    dispose() {
      if (latest) void start()
      else if (timer !== null) d.clearTimer(timer)
      timer = null
    },
  }
}
