const RETRY_DELAYS = [500, 1500, 4000]
const LOAD_TIMEOUT = 10000

/** Keep the original asset URL/manifest intact. A failed <img> otherwise stays
 * blank even after the file becomes available. Only failed/pending loads retry. */
export function recoverImage(img: HTMLImageElement, src: string): () => void {
  let attempt = 0
  let failed = false
  let stopped = false
  let timer: ReturnType<typeof setTimeout> | undefined
  const originalAlt = img.alt
  const originalTitle = img.title
  const clear = () => clearTimeout(timer)
  const loaded = () => {
    clear()
    failed = false
    attempt = 0
    img.alt = originalAlt
    img.title = originalTitle
  }
  const watch = () => {
    clear()
    timer = setTimeout(retry, LOAD_TIMEOUT)
  }
  const retry = () => {
    if (stopped) return
    clear()
    failed = true
    const delay = RETRY_DELAYS[attempt++]
    if (delay === undefined) {
      img.alt = '사진을 불러오지 못했어요'
      img.title = '창으로 돌아오면 사진을 다시 불러와요'
      return
    }
    timer = setTimeout(() => {
      // Reassigning the same URL starts a fresh image request after failure.
      // No query exceptions, filesystem paths or CSP relaxation are needed.
      img.src = src
      watch()
    }, delay)
  }
  const revisit = () => {
    if (img.ownerDocument.visibilityState === 'hidden') return
    if (failed && attempt > RETRY_DELAYS.length) {
      attempt = 0
      retry()
    }
  }
  const doc = img.ownerDocument
  const win = doc.defaultView
  img.addEventListener('load', loaded)
  img.addEventListener('error', retry)
  doc.addEventListener('visibilitychange', revisit)
  win?.addEventListener('focus', revisit)
  // An image can finish (or fail) before React's effect attaches the listeners.
  if (img.complete) {
    if (img.naturalWidth) loaded()
    else retry()
  } else watch()
  return () => {
    stopped = true
    clear()
    img.removeEventListener('load', loaded)
    img.removeEventListener('error', retry)
    doc.removeEventListener('visibilitychange', revisit)
    win?.removeEventListener('focus', revisit)
  }
}
