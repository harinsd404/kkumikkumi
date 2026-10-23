const pending = new Set<Promise<unknown>>()
const failed = new Set<string>()
export function trackSave<T>(
  key: string,
  promise: Promise<T>,
  ok: (value: T) => boolean,
): Promise<T> {
  pending.add(promise)
  void promise
    .then(
      (value) => {
        if (ok(value)) failed.delete(key)
        else failed.add(key)
      },
      () => {
        failed.add(key)
      },
    )
    .finally(() => pending.delete(promise))
  return promise
}
export async function flushTrackedSaves(): Promise<boolean> {
  while (pending.size) await Promise.allSettled([...pending])
  return failed.size === 0
}
