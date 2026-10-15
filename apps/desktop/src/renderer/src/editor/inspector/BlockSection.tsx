import { ALLOWED_SIZES, BLOCK_SIZES, type GridBlock } from '@kkumikkumi/schema'
import type { SwatchGroup } from '../../app/colorGroups'
import { ColorField, FontSelect, Row, Section, Segmented } from '../fields'
import type { EditorApi } from '../useEditor'
import { BlockProps, type BlockDataApis } from './BlockProps'
import { DecorFields } from './decor'
import { groupOf } from './group'
import { Actions } from './pickers'

/** 그리드 블록을 골랐을 때: 크기, 종류별 설정, 스타일 */
export function BlockSection({
  ed,
  block,
  swatches,
  apis,
  onDuplicate,
  onDelete,
}: {
  ed: EditorApi
  block: GridBlock
  swatches: readonly SwatchGroup[]
  apis: BlockDataApis
  onDuplicate(): void
  onDelete(): void
}) {
  const style = (patch: Partial<GridBlock['style']>, key?: string) =>
    ed.dispatch({ type: 'block/style', id: block.id, patch }, groupOf(block.id, key))
  return (
    <>
      <Section title="크기">
        <Segmented
          label="크기"
          value={block.size}
          options={(ALLOWED_SIZES[block.type] as readonly GridBlock['size'][]).map((s) => {
            const c = (BLOCK_SIZES[block.type] as Record<string, { w: number; h: number }>)[s]!
            return { value: s, label: `${s} ${c.w}×${c.h}` }
          })}
          onChange={(size) => ed.dispatch({ type: 'block/resize', id: block.id, size })}
        />
      </Section>
      <BlockProps ed={ed} block={block} apis={apis} />
      <Section title="스타일">
        <ColorField
          label="배경색"
          value={block.style.bg}
          nullLabel="투명"
          swatches={swatches}
          onChange={(c) => style({ bg: c }, 'bg')}
        />
        <ColorField
          label="글자색"
          value={block.style.textColor}
          nullLabel="팔레트"
          swatches={swatches}
          onChange={(c) => style({ textColor: c }, 'tc')}
        />
        <Row label="글꼴">
          <FontSelect
            value={block.style.fontId ?? ''}
            emptyLabel="테마 기본"
            onChange={(fontId) => style({ fontId: fontId || null })}
          />
        </Row>
        <DecorFields decor={block.style} swatches={swatches} apply={style} />
        <div className="ki-buttons">
          <button
            type="button"
            disabled={ed.theme.blocks.every(
              (b) =>
                b.style.border.width === block.style.border.width &&
                b.style.border.color === block.style.border.color,
            )}
            onClick={() =>
              ed.dispatch({
                type: 'block/styleAll',
                patch: { border: { ...block.style.border } },
              })
            }
          >
            이 외곽선을 모든 블록에 적용
          </button>
        </div>
      </Section>
      <Actions onDuplicate={onDuplicate} onDelete={onDelete} />
    </>
  )
}
