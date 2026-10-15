import type { FreeItem } from '@kkumikkumi/schema'
import type { SwatchGroup } from '../../app/colorGroups'
import { NumberField, Row, Section, Segmented, Slider } from '../fields'
import type { EditorApi } from '../useEditor'
import { DecorFields, FreeImageFields } from './decor'
import { groupOf } from './group'
import { Actions } from './pickers'

const BOX_FIELDS = [
  ['x', 'X'],
  ['y', 'Y'],
  ['w', '너비'],
  ['h', '높이'],
] as const

const ORDER = [
  ['back', '맨 뒤로'],
  ['backward', '뒤로'],
  ['forward', '앞으로'],
  ['front', '맨 앞으로'],
] as const

/** 자유 아이템(이미지/스티커)을 골랐을 때: 위치와 크기, 배치, 이미지 옵션, 장식 */
export function FreeSection({
  ed,
  free,
  swatches,
  onDuplicate,
  onDelete,
}: {
  ed: EditorApi
  free: FreeItem
  swatches: readonly SwatchGroup[]
  onDuplicate(): void
  onDelete(): void
}) {
  const update = (patch: Partial<FreeItem>, key?: string) =>
    ed.dispatch({ type: 'free/update', id: free.id, patch }, groupOf(free.id, key))
  return (
    <>
      <Section title="위치와 크기">
        <div className="ki-grid2">
          {BOX_FIELDS.map(([k, label]) => (
            <NumberField
              key={k}
              label={label}
              value={free[k]}
              onChange={(v) => update({ [k]: v }, k)}
            />
          ))}
        </div>
        <Slider
          label="회전"
          value={free.rotation}
          min={-180}
          max={180}
          format={(v) => `${Math.round(v)}°`}
          onChange={(rotation) => update({ rotation }, 'rot')}
        />
      </Section>
      <Section title="배치">
        <Segmented
          label="레이어"
          value={free.layer}
          options={[
            { value: 'back', label: '블록 뒤' },
            { value: 'front', label: '블록 앞' },
          ]}
          onChange={(layer) => ed.dispatch({ type: 'free/layer', id: free.id, layer })}
        />
        <div className="ki-buttons" role="group" aria-label="순서">
          {ORDER.map(([to, label]) => (
            <button
              key={to}
              type="button"
              onClick={() => ed.dispatch({ type: 'free/order', id: free.id, to })}
            >
              {label}
            </button>
          ))}
        </div>
        <Row label="잠금">
          <input
            type="checkbox"
            checked={free.locked}
            onChange={(e) => update({ locked: e.target.checked })}
          />
        </Row>
      </Section>
      {free.kind === 'image' && <FreeImageFields ed={ed} item={free} />}
      <Section title="장식">
        <DecorFields
          decor={free.decor}
          swatches={swatches}
          apply={(patch, key) =>
            ed.dispatch({ type: 'free/decor', id: free.id, patch }, groupOf(free.id, key))
          }
        />
      </Section>
      <Actions onDuplicate={onDuplicate} onDelete={onDelete} />
    </>
  )
}
