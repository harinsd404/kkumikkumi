import { useCallback, useEffect, useState } from 'react'

type Handler = (e: PointerEvent) => void

/**
 * pointermove/pointerup을 window에서 받는다(빠르게 움직여 요소 밖으로 나가도 끊기지 않도록).
 * 돌려주는 함수를 부르면 onUp 없이 그만둔다.
 */
export function trackPointer(onMove: Handler, onUp: Handler): () => void {
  const stop = () => {
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', up)
    window.removeEventListener('pointercancel', up)
  }
  const up = (e: PointerEvent) => {
    stop()
    onUp(e)
  }
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', up)
  window.addEventListener('pointercancel', up)
  return stop
}

/** trackPointer와 같지만, 끌기 도중 컴포넌트가 사라지면 리스너를 떼고 onUp은 부르지 않는다. */
export function usePointerTrack(): (onMove: Handler, onUp: Handler) => void {
  const [active] = useState(() => new Set<() => void>())
  useEffect(
    () => () => {
      for (const stop of active) stop()
      active.clear()
    },
    [active],
  )
  return useCallback(
    (onMove: Handler, onUp: Handler) => {
      const stop = trackPointer(onMove, (e) => {
        active.delete(stop)
        onUp(e)
      })
      active.add(stop)
    },
    [active],
  )
}
