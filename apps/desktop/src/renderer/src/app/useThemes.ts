import { useCallback, useEffect, useState } from 'react'
import type { ThemeSummary } from '../../../shared/api'

/** 저장된 테마 목록(이름, 대표색). 메뉴를 열 때 refresh로 다시 읽는다. */
export function useThemes(): { list: ThemeSummary[]; refresh(): Promise<void> } {
  const [list, setList] = useState<ThemeSummary[]>([])
  const refresh = useCallback(async () => {
    const r = await window.kkumi.invoke('themes.list')
    if (r.ok) setList(r.value)
  }, [])
  useEffect(() => {
    void (async () => {
      const r = await window.kkumi.invoke('themes.list')
      if (r.ok) setList(r.value)
    })()
  }, [])
  return { list, refresh }
}
