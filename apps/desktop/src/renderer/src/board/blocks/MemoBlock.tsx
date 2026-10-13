import type { GridBlock } from '@kkumikkumi/schema'
import type { CSSProperties } from 'react'
import { useBoard } from '../BoardContext'
import { MemoView } from '../MemoView'

type MemoBlockT = Extract<GridBlock, { type: 'memo' }>

/**
 * 고른 메모를 서식대로 보여 준다(편집은 메모 페이지에서). 사용 모드에서는 체크리스트를 바로 체크할 수 있다.
 * 넘치면 블록 안에서 스크롤.
 */
export function MemoBlock({ block }: { block: MemoBlockT }) {
  const { theme, data, actions, mode } = useBoard()
  const p = theme.defaults.palette
  const vars = {
    '--mm-accent': p.accent,
    '--mm-check': p.check,
    '--mm-sub': p.subText,
    color: p.text,
  } as CSSProperties
  const id = block.props.memoId
  const memo = id ? data.memos?.find((m) => m.id === id) : undefined
  const toggle = mode === 'use' ? actions?.memo?.toggle : undefined

  let empty: string | null = null
  if (!id)
    empty =
      mode === 'edit' ? '오른쪽에서 보여 줄 메모를 골라 주세요' : '편집에서 메모를 골라 주세요'
  else if (!data.memos) empty = ''
  else if (!memo) empty = '지워진 메모예요'
  else if (!memo.body.trim()) empty = '빈 메모예요'

  return (
    <div className={`kmm kmm--${block.size}`} style={vars}>
      {empty !== null ? (
        <p className="kmm-empty">{empty}</p>
      ) : (
        <MemoView
          body={memo!.body}
          fontSize={20}
          {...(toggle ? { onToggle: (line: number) => toggle(memo!.id, line) } : {})}
        />
      )}
    </div>
  )
}
