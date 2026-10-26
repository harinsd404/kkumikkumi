import { useMemo, useState } from 'react'
import { colorGroups, type ThemeColors } from '../../app/colorGroups'
import { BLOCK_TYPE_LABEL } from '../../board/blockLabels'
import type { EditorApi } from '../useEditor'
import { BlockSection } from './BlockSection'
import type { BlockDataApis } from './BlockProps'
import { FreeSection } from './FreeSection'
import { ThemeSection } from './ThemeSection'

export interface InspectorProps extends BlockDataApis {
  ed: EditorApi
  onDuplicate(): void
  onDelete(): void
  /** 색 고르기에 함께 보여 줄 다른 테마들 */
  otherThemes?: readonly ThemeColors[] | undefined
}

/** 편집 모드 오른쪽 설정 패널. 고른 대상(없음 = 테마, 블록, 자유 아이템)에 맞는 설정을 보여 준다. */
export function Inspector({ ed, onDuplicate, onDelete, otherThemes, ...apis }: InspectorProps) {
  const [open, setOpen] = useState(true)
  const t = ed.theme
  const palette = t.defaults.palette
  const bgColor = t.background.type === 'color' ? t.background.color : null
  const swatches = useMemo(
    () => colorGroups({ name: t.name, palette, bgColor }, otherThemes ?? []),
    [t.name, palette, bgColor, otherThemes],
  )
  const sel = ed.selection
  const block = sel?.kind === 'block' ? t.blocks.find((b) => b.id === sel.id) : undefined
  const free = sel?.kind === 'free' ? t.freeItems.find((f) => f.id === sel.id) : undefined

  const title = block
    ? `${BLOCK_TYPE_LABEL[block.type]} 블록`
    : free
      ? free.kind === 'image'
        ? '이미지'
        : '스티커'
      : '테마'

  return (
    <aside
      className={`ki ${open ? '' : 'is-closed'}`}
      aria-label="인스펙터"
      onKeyDown={(e) => e.stopPropagation()}
    >
      <header className="ki-head">
        <strong>{title}</strong>
        <button
          type="button"
          className="ki-toggle"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
        >
          {open ? '접기' : '펼치기'}
        </button>
      </header>
      {open && (
        // 고른 대상이 바뀌면 안쪽 입력 상태(이름 바꾸기, 삭제 확인 등)를 새로 시작한다
        <div className="ki-body" key={block?.id ?? free?.id ?? 'theme'}>
          {!block && !free && <ThemeSection ed={ed} swatches={swatches} />}
          {block && (
            <BlockSection
              ed={ed}
              block={block}
              swatches={swatches}
              apis={apis}
              onDuplicate={onDuplicate}
              onDelete={onDelete}
            />
          )}
          {free && (
            <FreeSection
              ed={ed}
              free={free}
              swatches={swatches}
              onDuplicate={onDuplicate}
              onDelete={onDelete}
            />
          )}
        </div>
      )}
    </aside>
  )
}
