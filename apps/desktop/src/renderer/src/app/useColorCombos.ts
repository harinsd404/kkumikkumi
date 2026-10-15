import type { ColorCombo, LookColors } from '@kkumikkumi/schema'
import { useCallback, useEffect, useState } from 'react'

const COMBO_ERRORS: Record<string, string> = {
  conflict: '내 색 조합은 30개까지 저장할 수 있어요',
  invalid_input: '이름이나 색이 올바르지 않아요',
}

async function fetchCombos(): Promise<ColorCombo[] | null> {
  const r = await window.kkumi.invoke('colorCombos.list')
  return r.ok ? r.value : null
}

/** 내 색 조합(테마 만들기 창에서 저장). add/remove는 실패하면 보여 줄 문구를 돌려준다. */
export function useColorCombos(): {
  list: ColorCombo[]
  add(name: string, colors: LookColors): Promise<string | null>
  remove(id: string): Promise<string | null>
} {
  const [list, setList] = useState<ColorCombo[]>([])
  useEffect(() => {
    void fetchCombos().then((v) => v && setList(v))
  }, [])
  const add = useCallback(async (name: string, colors: LookColors) => {
    const r = await window.kkumi.invoke('colorCombos.add', { name, ...colors })
    if (!r.ok) return COMBO_ERRORS[r.error.code] ?? '저장하지 못했어요'
    setList((l) => [r.value, ...l])
    return null
  }, [])
  const remove = useCallback(async (id: string) => {
    const r = await window.kkumi.invoke('colorCombos.delete', { id })
    if (!r.ok) return '지우지 못했어요'
    setList((l) => l.filter((c) => c.id !== id))
    return null
  }, [])
  return { list, add, remove }
}
