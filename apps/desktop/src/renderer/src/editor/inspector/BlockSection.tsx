import { ALLOWED_SIZES, BLOCK_SIZES, type GridBlock } from '@kkumikkumi/schema'
import type { SwatchGroup } from '../../app/colorGroups'
import { ColorField, FontSelect, Row, Section, Segmented, Slider } from '../fields'
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
        {block.type !== 'image' && (
          <BgImageFields
            bg={block.style.bgImage}
            hasBgColor={block.style.bg !== null}
            pickImage={apis.pickImage}
            onChange={(bgImage, key) => style({ bgImage }, key)}
            onAdjust={() => ed.adjust({ kind: 'blockBg', id: block.id })}
          />
        )}
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

/** 블록 배경 사진: 고르기·바꾸기·빼기, 덮개(배경색으로 덮는 정도), 끌어서 위치 조정 */
function BgImageFields({
  bg,
  hasBgColor,
  pickImage,
  onChange,
  onAdjust,
}: {
  bg: GridBlock['style']['bgImage']
  hasBgColor: boolean
  pickImage: BlockDataApis['pickImage']
  onChange(bg: GridBlock['style']['bgImage'], groupKey?: string): void
  onAdjust(): void
}) {
  const pick = async () => {
    const a = await pickImage('image')
    if (!a) return
    // 새 사진은 가운데에서, 글자가 읽히도록 조금 덮어서 시작
    onChange({ assetHash: a.hash, focus: { x: 0.5, y: 0.5 }, veil: bg?.veil ?? 0.35 })
    onAdjust()
  }
  return (
    <>
      <Row label="배경 사진">
        <span className="ki-buttons">
          <button type="button" onClick={() => void pick()}>
            {bg ? '바꾸기' : '+ 사진 고르기'}
          </button>
          {bg && (
            <>
              <button type="button" onClick={onAdjust}>
                위치 조정
              </button>
              <button type="button" onClick={() => onChange(null)}>
                빼기
              </button>
            </>
          )}
        </span>
      </Row>
      {bg && (
        <>
          <Slider
            label="사진 덮개"
            value={bg.veil}
            min={0}
            max={0.8}
            step={0.05}
            format={(v) => `${Math.round(v * 100)}%`}
            onChange={(veil) => onChange({ ...bg, veil }, 'veil')}
          />
          <p className="ki-note">
            덮개는 사진 위를 {hasBgColor ? '배경색' : '흰색'}으로 살짝 덮어 글자를 읽기 쉽게 해요.
            보드에서 블록을 두 번 누르면 사진을 끌어 위치를 옮길 수 있어요.
          </p>
        </>
      )}
    </>
  )
}
