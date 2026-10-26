import type { FreeItem, GridBlock } from '@kkumikkumi/schema'
import type { SwatchGroup } from '../../app/colorGroups'
import { ColorField, Section, Segmented, Slider } from '../fields'
import type { EditorApi } from '../useEditor'
import { groupOf } from './group'
import type { BlockDataApis } from './BlockProps'

type Decor = FreeItem['decor']
type ImageContent = Extract<GridBlock, { type: 'image' }>['props']

const SHADOWS = [
  { value: 'none', label: '없음' },
  { value: 'soft', label: '약' },
  { value: 'medium', label: '중' },
  { value: 'strong', label: '강' },
] as const
/** 외곽선을 켤 때 두께(기본 블록 외곽선과 같음) */
const DEFAULT_BORDER_WIDTH = 2.5
const pct = (v: number) => `${Math.round(v * 100)}%`

/** 모서리, 외곽선, 그림자, 투명도(블록 스타일과 자유 아이템 장식 공용) */
export function DecorFields(props: {
  decor: Decor
  swatches: readonly SwatchGroup[]
  apply(patch: Partial<Decor>, groupKey?: string): void
}) {
  const { decor, apply } = props
  return (
    <>
      <Slider
        label="모서리"
        value={decor.radius}
        min={0}
        max={64}
        onChange={(radius) => apply({ radius }, 'radius')}
      />
      <Segmented
        label="외곽선"
        value={decor.border.width > 0 ? 'on' : 'off'}
        options={[
          { value: 'on', label: '있음' },
          { value: 'off', label: '없음' },
        ]}
        onChange={(v) =>
          apply({ border: { ...decor.border, width: v === 'on' ? DEFAULT_BORDER_WIDTH : 0 } })
        }
      />
      {decor.border.width > 0 && (
        <Slider
          label="두께"
          value={decor.border.width}
          min={0.5}
          max={16}
          step={0.5}
          onChange={(width) => apply({ border: { ...decor.border, width } }, 'bw')}
        />
      )}
      {decor.border.width > 0 && (
        <ColorField
          label="외곽선 색"
          value={decor.border.color}
          nullLabel="강조색"
          swatches={props.swatches}
          onChange={(color) => apply({ border: { ...decor.border, color } }, 'bc')}
        />
      )}
      <Segmented
        label="그림자"
        value={decor.shadow}
        options={SHADOWS}
        onChange={(shadow) => apply({ shadow })}
      />
      <Slider
        label="투명도"
        value={decor.opacity}
        min={0.1}
        max={1}
        step={0.05}
        format={pct}
        onChange={(opacity) => apply({ opacity }, 'op')}
      />
    </>
  )
}

/** 이미지 맞춤/초점/확대/모양(그리드 image 블록과 자유 이미지 공용) */
/**
 * 이미지 옵션. 사진 위치는 보드에서 끌어서 정한다(가로·세로 초점 슬라이더 대신, 2026-10-16 사용자 지시).
 * onAdjust가 있고 사진이 있으면 "사진 위치 조정" 버튼으로 끌기 모드를 켠다.
 */
export function ImageContentFields(props: {
  content: ImageContent
  apply(patch: Partial<ImageContent>, groupKey?: string): void
  onAdjust?: (() => void) | undefined
}) {
  const { content: c, apply, onAdjust } = props
  return (
    <>
      {onAdjust && c.assetHash && (
        <div className="ki-buttons">
          <button type="button" onClick={onAdjust}>
            사진 위치 조정 (끌기)
          </button>
          <button
            type="button"
            disabled={c.focus.x === 0.5 && c.focus.y === 0.5}
            onClick={() => apply({ focus: { ...c.focus, x: 0.5, y: 0.5 } })}
          >
            가운데로
          </button>
        </div>
      )}
      <Segmented
        label="맞춤"
        value={c.fit}
        options={[
          { value: 'cover', label: '채우기' },
          { value: 'contain', label: '전체 보기' },
        ]}
        onChange={(fit) => apply({ fit })}
      />
      <Slider
        label="확대"
        value={c.focus.zoom}
        min={1}
        max={4}
        step={0.05}
        format={(v) => `${v.toFixed(2)}×`}
        onChange={(zoom) => apply({ focus: { ...c.focus, zoom } }, 'zoom')}
      />
      <Segmented
        label="모양"
        value={c.shape}
        options={[
          { value: 'rect', label: '사각형' },
          { value: 'circle', label: '원' },
        ]}
        onChange={(shape) => apply({ shape })}
      />
    </>
  )
}

export function FreeImageFields({
  ed,
  item,
  pickImage,
}: {
  ed: EditorApi
  item: Extract<FreeItem, { kind: 'image' }>
  pickImage?: BlockDataApis['pickImage'] | undefined
}) {
  return (
    <Section title="이미지">
      {pickImage && (
        <div className="ki-buttons">
          <button
            type="button"
            onClick={async () => {
              const asset = await pickImage('image')
              if (!asset) return
              if (
                ed.dispatch({
                  type: 'free/content',
                  id: item.id,
                  patch: {
                    assetHash: asset.hash,
                    focus: { ...item.content.focus, x: 0.5, y: 0.5 },
                  },
                }) &&
                !item.locked
              )
                ed.adjust({ kind: 'free', id: item.id })
            }}
          >
            {item.content.assetHash ? '이미지 바꾸기' : '+ 이미지 고르기'}
          </button>
          {item.content.assetHash && (
            <button
              type="button"
              onClick={() => {
                ed.dispatch({ type: 'free/content', id: item.id, patch: { assetHash: null } })
                ed.adjust(null)
              }}
            >
              비우기
            </button>
          )}
        </div>
      )}
      <ImageContentFields
        content={item.content}
        apply={(patch, key) =>
          ed.dispatch({ type: 'free/content', id: item.id, patch }, groupOf(item.id, key))
        }
        onAdjust={item.locked ? undefined : () => ed.adjust({ kind: 'free', id: item.id })}
      />
    </Section>
  )
}
