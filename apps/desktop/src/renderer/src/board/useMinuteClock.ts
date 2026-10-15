import { useEffect, useState } from 'react'

/** 날짜 표시용 시계(분 단위). 자정이 지나면 캘린더/투두 섹션이 다음 날로 넘어간다. 카운트다운에는 쓰지 않는다. */
export function useMinuteClock(): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    let t: number
    const tick = () => {
      setNow(new Date())
      t = window.setTimeout(tick, 60_000 - (Date.now() % 60_000) + 50)
    }
    t = window.setTimeout(tick, 60_000 - (Date.now() % 60_000) + 50)
    const onFocus = () => setNow(new Date()) // 절전 복귀 후 바로 맞춘다
    window.addEventListener('focus', onFocus)
    return () => {
      window.clearTimeout(t)
      window.removeEventListener('focus', onFocus)
    }
  }, [])
  return now
}
