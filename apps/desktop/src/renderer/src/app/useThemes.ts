import { useCallback, useEffect, useState } from 'react'
import type { ThemeSummary } from '../../../shared/api'

async function fetchList(): Promise<ThemeSummary[] | null> {
  const r = await window.kkumi.invoke('themes.list')
  return r.ok ? r.value : null
}

/** 저장된 테마 목록(이름, 대표색). 메뉴를 열 때 refresh로 다시 읽는다. */
export function useThemes(): { list: ThemeSummary[]; refresh(): Promise<void> } {
  const [list, setList] = useState<ThemeSummary[]>([])
  const refresh = useCallback(async () => {
    const v = await fetchList()
    if (v) setList(v)
  }, [])
  useEffect(() => {
    void fetchList().then((v) => v && setList(v))
  }, [])
  return { list, refresh }
}
