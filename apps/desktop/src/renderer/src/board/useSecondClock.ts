import { useEffect, useState } from 'react'

/** 표시용 현재 시각. 실행 중일 때만 초가 바뀌는 순간에 다시 그린다(카운트다운은 endsAt 계산). */
export function useSecondClock(running: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!running) return
    let raf = 0
    let last = -1 // 첫 프레임에서 바로 맞춘다(멈춰 있던 동안의 오래된 값 방지)
    const loop = () => {
      const s = Math.floor(Date.now() / 1000)
      if (s !== last) {
        last = s
        setNow(Date.now())
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [running])
  return now // 실행 중이 아니면 남은 시간 계산에 쓰이지 않는다
}
