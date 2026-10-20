import { useEffect, useLayoutEffect, useRef, useState } from 'react'

/**
 * key가 바뀔 때마다 load를 불러 결과를 돌려준다. 지금 key의 결과만 돌려주고(아직이면 undefined),
 * 이전 key의 늦은 응답은 버린다. key에는 load가 쓰는 입력을 모두 넣는다. load가 null이면 부르지 않는다.
 */
export function useKeyedAsync<T>(
  key: string,
  load: (() => Promise<T>) | null,
  /** 다시 읽는 동안 이전 값을 그대로 보여 준다(깜빡임 방지) */
  keepStale = false,
): T | undefined {
  const [state, setState] = useState<{ key: string; value: T }>()
  const latest = useRef(load)
  useLayoutEffect(() => {
    latest.current = load
  })
  const enabled = load !== null
  useEffect(() => {
    const fn = latest.current
    if (!enabled || !fn) return
    let alive = true
    void fn().then((value) => {
      if (alive) setState({ key, value })
    })
    return () => {
      alive = false
    }
  }, [key, enabled])
  return state?.key === key || (keepStale && enabled) ? state?.value : undefined
}
