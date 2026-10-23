/** Keep failed saves and edits typed during an IPC call in the queue. */
export async function flushMemoChanges<T>(
  pending: Map<string, string>,
  save: (id: string, body: string) => Promise<{ ok: true; value: T } | { ok: false }>,
  saved: (id: string, value: T) => void,
): Promise<boolean> {
  for (const [id, body] of [...pending]) {
    try {
      const result = await save(id, body)
      if (!result.ok) continue
      if (pending.get(id) === body) pending.delete(id)
      saved(id, result.value)
    } catch {
      // A transport failure is retryable, just like an IPC error response.
    }
  }
  return pending.size === 0
}
