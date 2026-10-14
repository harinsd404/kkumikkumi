import {
  ALLOWED_SIZES,
  BLOCK_SIZES,
  type FreeItem,
  type GridBlock,
  type Memo,
  type Palette,
  type TodoList,
} from '@kkumikkumi/schema'
import { useState } from 'react'
import { FONTS } from '../board/fonts'
import { memoTitle } from '../board/memoFormat'
import { ColorField, NumberField, Row, Section, Segmented, Slider } from './fields'
import type { EditorApi } from './useEditor'

interface Props {
  ed: EditorApi
  /** 파일 선택 → 테마 에셋. 실패/취소면 null */
  pickImage(purpose: 'image'): Promise<{ hash: string } | null>
  onDuplicate(): void
  onDelete(): void
  /** 투두 목록 관리(사용자 데이터). 없으면 목록 선택을 숨긴다. */
  todoLists?: TodoListsApi | undefined
  /** 메모 고르기/새로 만들기(사용자 데이터). 없으면 메모 선택을 숨긴다. */
  memos?: MemoPickApi | undefined
}

export interface MemoPickApi {
  /** 처음 읽기 전에는 undefined */
  memos: readonly Memo[] | undefined
  create(): Promise<Memo | null>
}

export interface TodoListsApi {
  all: readonly TodoList[]
  create(name: string): Promise<TodoList | null>
  rename(id: string, name: string): Promise<boolean>
  remove(id: string): Promise<boolean>
}

const TYPE_LABEL: Record<GridBlock['type'], string> = {
  calendar: '캘린더',
  todo: '투두',
  timer: '타이머',
  image: '이미지',
  memo: '메모',
  timetable: '시간표',
}
const SHADOWS = [
  { value: 'none', label: '없음' },
  { value: 'soft', label: '약' },
  { value: 'medium', label: '중' },
  { value: 'strong', label: '강' },
] as const
const PALETTE_LABEL: Record<keyof Palette, string> = {
  text: '제목 글자',
  subText: '보조 글자',
  accent: '강조(외곽선)',
  check: '체크',
  surface: '칸 배경',
  control: '버튼',
}
const fontOptions = Object.entries(FONTS).map(([id, f]) => ({ id, label: f.label }))
const pct = (v: number) => `${Math.round(v * 100)}%`

export function Inspector({ ed, pickImage, onDuplicate, onDelete, todoLists, memos }: Props) {
  const [open, setOpen] = useState(true)
  const t = ed.theme
  const palette = t.defaults.palette
  const swatches = [...Object.values(palette), '#ffffff', '#000000']
  const sel = ed.selection
  const block = sel?.kind === 'block' ? t.blocks.find((b) => b.id === sel.id) : undefined
  const free = sel?.kind === 'free' ? t.freeItems.find((f) => f.id === sel.id) : undefined
  const g = (key: string) => ({ groupKey: key }) // 슬라이더 연속 조작 묶기

  const title = block
    ? `${TYPE_LABEL[block.type]} 블록`
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
        <div className="ki-body">
          {!block && !free && (
            <>
              <Section title="배경">
                {t.background.type === 'color' ? (
                  <>
                    <ColorField
                      label="배경색"
                      value={t.background.color}
                      swatches={swatches}
                      onChange={(c) =>
                        c && ed.dispatch({ type: 'theme/background', patch: { color: c } }, g('bg'))
                      }
                    />
                    <Segmented
                      label="무늬"
                      value={t.background.pattern?.id ?? 'none'}
                      options={[
                        { value: 'none', label: '없음' },
                        { value: 'stars', label: '별' },
                        { value: 'dots', label: '점' },
                      ]}
                      onChange={(id) => {
                        const bg = t.background.type === 'color' ? t.background : null
                        ed.dispatch({
                          type: 'theme/background',
                          patch: {
                            pattern:
                              id === 'none'
                                ? null
                                : { id, color: bg?.pattern?.color ?? palette.subText },
                          },
                        })
                      }}
                    />
                    {t.background.pattern && (
                      <ColorField
                        label="무늬 색"
                        value={t.background.pattern.color}
                        swatches={swatches}
                        onChange={(c) => {
                          const p = t.background.type === 'color' ? t.background.pattern : null
                          if (c && p)
                            ed.dispatch(
                              { type: 'theme/background', patch: { pattern: { ...p, color: c } } },
                              g('pattern'),
                            )
                        }}
                      />
                    )}
                  </>
                ) : (
                  <p className="ki-note">이미지 배경은 아직 편집할 수 없어요.</p>
                )}
              </Section>
              <Section title="팔레트">
                {(Object.keys(PALETTE_LABEL) as (keyof Palette)[]).map((k) => (
                  <ColorField
                    key={k}
                    label={PALETTE_LABEL[k]}
                    value={palette[k]}
                    swatches={swatches}
                    onChange={(c) =>
                      c &&
                      ed.dispatch({ type: 'theme/palette', patch: { [k]: c } }, g(`palette:${k}`))
                    }
                  />
                ))}
              </Section>
              <Section title="글꼴">
                <Row label="기본 글꼴">
                  <select
                    value={t.defaults.fontId}
                    onChange={(e) => ed.dispatch({ type: 'theme/font', fontId: e.target.value })}
                  >
                    {fontOptions.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                </Row>
              </Section>
              <p className="ki-note">블록이나 꾸미기를 누르면 그 설정이 보여요.</p>
            </>
          )}

          {block && (
            <>
              <Section title="크기">
                <Segmented
                  label="크기"
                  value={block.size}
                  options={(ALLOWED_SIZES[block.type] as readonly GridBlock['size'][]).map((s) => {
                    const c = (BLOCK_SIZES[block.type] as Record<string, { w: number; h: number }>)[
                      s
                    ]!
                    return { value: s, label: `${s} ${c.w}×${c.h}` }
                  })}
                  onChange={(size) => ed.dispatch({ type: 'block/resize', id: block.id, size })}
                />
              </Section>
              <BlockProps
                ed={ed}
                block={block}
                pickImage={pickImage}
                todoLists={todoLists}
                memos={memos}
              />
              <Section title="스타일">
                <ColorField
                  label="배경색"
                  value={block.style.bg}
                  nullLabel="투명"
                  swatches={swatches}
                  onChange={(c) =>
                    ed.dispatch(
                      { type: 'block/style', id: block.id, patch: { bg: c } },
                      g(`bg:${block.id}`),
                    )
                  }
                />
                <ColorField
                  label="글자색"
                  value={block.style.textColor}
                  nullLabel="팔레트"
                  swatches={swatches}
                  onChange={(c) =>
                    ed.dispatch(
                      { type: 'block/style', id: block.id, patch: { textColor: c } },
                      g(`tc:${block.id}`),
                    )
                  }
                />
                <Row label="글꼴">
                  <select
                    value={block.style.fontId ?? ''}
                    onChange={(e) =>
                      ed.dispatch({
                        type: 'block/style',
                        id: block.id,
                        patch: { fontId: e.target.value || null },
                      })
                    }
                  >
                    <option value="">테마 기본</option>
                    {fontOptions.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                </Row>
                <DecorFields
                  ed={ed}
                  decor={block.style}
                  swatches={swatches}
                  apply={(patch, key) =>
                    ed.dispatch(
                      { type: 'block/style', id: block.id, patch },
                      key ? g(`${key}:${block.id}`) : {},
                    )
                  }
                />
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
          )}

          {free && (
            <>
              <Section title="위치와 크기">
                <div className="ki-grid2">
                  <NumberField
                    label="X"
                    value={free.x}
                    onChange={(x) =>
                      ed.dispatch(
                        { type: 'free/update', id: free.id, patch: { x } },
                        g(`x:${free.id}`),
                      )
                    }
                  />
                  <NumberField
                    label="Y"
                    value={free.y}
                    onChange={(y) =>
                      ed.dispatch(
                        { type: 'free/update', id: free.id, patch: { y } },
                        g(`y:${free.id}`),
                      )
                    }
                  />
                  <NumberField
                    label="너비"
                    value={free.w}
                    onChange={(w) =>
                      ed.dispatch(
                        { type: 'free/update', id: free.id, patch: { w } },
                        g(`w:${free.id}`),
                      )
                    }
                  />
                  <NumberField
                    label="높이"
                    value={free.h}
                    onChange={(h) =>
                      ed.dispatch(
                        { type: 'free/update', id: free.id, patch: { h } },
                        g(`h:${free.id}`),
                      )
                    }
                  />
                </div>
                <Slider
                  label="회전"
                  value={free.rotation}
                  min={-180}
                  max={180}
                  format={(v) => `${Math.round(v)}°`}
                  onChange={(rotation) =>
                    ed.dispatch(
                      { type: 'free/update', id: free.id, patch: { rotation } },
                      g(`rot:${free.id}`),
                    )
                  }
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
                  {(
                    [
                      ['back', '맨 뒤로'],
                      ['backward', '뒤로'],
                      ['forward', '앞으로'],
                      ['front', '맨 앞으로'],
                    ] as const
                  ).map(([to, label]) => (
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
                    onChange={(e) =>
                      ed.dispatch({
                        type: 'free/update',
                        id: free.id,
                        patch: { locked: e.target.checked },
                      })
                    }
                  />
                </Row>
              </Section>
              {free.kind === 'image' && <FreeImageFields ed={ed} item={free} />}
              <Section title="장식">
                <DecorFields
                  ed={ed}
                  decor={free.decor}
                  swatches={swatches}
                  apply={(patch, key) =>
                    ed.dispatch(
                      { type: 'free/decor', id: free.id, patch },
                      key ? g(`${key}:${free.id}`) : {},
                    )
                  }
                />
              </Section>
              <Actions onDuplicate={onDuplicate} onDelete={onDelete} />
            </>
          )}
        </div>
      )}
    </aside>
  )
}

type Decor = FreeItem['decor']
/** 외곽선을 켤 때 두께(기본 블록 외곽선과 같음) */
const DEFAULT_BORDER_WIDTH = 2.5

function DecorFields(props: {
  ed: EditorApi
  decor: Decor
  swatches: readonly string[]
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

type ImageContent = Extract<GridBlock, { type: 'image' }>['props']

function ImageContentFields(props: {
  content: ImageContent
  apply(patch: Partial<ImageContent>, groupKey?: string): void
}) {
  const { content: c, apply } = props
  return (
    <>
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
        label="가로 초점"
        value={c.focus.x}
        min={0}
        max={1}
        step={0.01}
        format={pct}
        onChange={(x) => apply({ focus: { ...c.focus, x } }, 'fx')}
      />
      <Slider
        label="세로 초점"
        value={c.focus.y}
        min={0}
        max={1}
        step={0.01}
        format={pct}
        onChange={(y) => apply({ focus: { ...c.focus, y } }, 'fy')}
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

function FreeImageFields({
  ed,
  item,
}: {
  ed: EditorApi
  item: Extract<FreeItem, { kind: 'image' }>
}) {
  return (
    <Section title="이미지">
      <ImageContentFields
        content={item.content}
        apply={(patch, key) =>
          ed.dispatch(
            { type: 'free/content', id: item.id, patch },
            key ? { groupKey: `${key}:${item.id}` } : {},
          )
        }
      />
    </Section>
  )
}

function BlockProps({
  ed,
  block,
  pickImage,
  todoLists,
  memos,
}: {
  ed: EditorApi
  block: GridBlock
  pickImage: Props['pickImage']
  todoLists: Props['todoLists']
  memos: Props['memos']
}) {
  const set = (patch: Record<string, unknown>, key?: string) =>
    ed.dispatch(
      { type: 'block/props', id: block.id, patch },
      key ? { groupKey: `${key}:${block.id}` } : {},
    )
  switch (block.type) {
    case 'calendar':
      return (
        <Section title="캘린더">
          <Segmented
            label="주 시작"
            value={block.props.weekStartsOn}
            options={[
              { value: 0, label: '일요일' },
              { value: 1, label: '월요일' },
            ]}
            onChange={(weekStartsOn) => set({ weekStartsOn })}
          />
          {block.size === 'L' && (
            <Segmented
              label="보기"
              value={block.props.view}
              options={[
                { value: 'month', label: '월' },
                { value: 'week', label: '주' },
              ]}
              onChange={(view) => set({ view })}
            />
          )}
        </Section>
      )
    case 'todo':
      return (
        <Section title="투두">
          {todoLists && (
            <TodoListFields
              lists={todoLists}
              listId={block.props.listId}
              onSelect={(listId) => set({ listId })}
            />
          )}
          <Row label="완료한 일 보기">
            <input
              type="checkbox"
              checked={block.props.showCompleted}
              onChange={(e) => set({ showCompleted: e.target.checked })}
            />
          </Row>
        </Section>
      )
    case 'timer':
      return (
        <Section title="타이머">
          <Segmented
            label="표시"
            value={block.props.display}
            options={[
              { value: 'digital', label: '숫자' },
              { value: 'ring', label: '링' },
            ]}
            onChange={(display) => set({ display })}
          />
          <PresetFields
            presets={block.props.presetsMin}
            onChange={(presetsMin) => set({ presetsMin })}
          />
        </Section>
      )
    case 'memo':
      return (
        <Section title="메모">
          {memos ? (
            <MemoFields
              api={memos}
              memoId={block.props.memoId}
              onSelect={(memoId) => set({ memoId })}
            />
          ) : (
            <p className="ki-note">메모를 불러오지 못했어요</p>
          )}
        </Section>
      )
    case 'timetable':
      return (
        <Section title="시간표">
          <p className="ki-note">
            과목과 교시 시각은 시간표 페이지에서 고쳐요. S·M은 오늘 수업, L은 한 주를 보여 줘요.
          </p>
        </Section>
      )
    case 'image':
      return (
        <Section title="이미지">
          <div className="ki-buttons">
            <button
              type="button"
              onClick={async () => {
                const a = await pickImage('image')
                if (a) set({ assetHash: a.hash })
              }}
            >
              {block.props.assetHash ? '이미지 바꾸기' : '이미지 고르기'}
            </button>
            {block.props.assetHash && (
              <button type="button" onClick={() => set({ assetHash: null })}>
                비우기
              </button>
            )}
          </div>
          <ImageContentFields content={block.props} apply={(patch, key) => set(patch, key)} />
        </Section>
      )
  }
}

/** 메모 블록이 보여 줄 메모 고르기 + 새 메모 */
function MemoFields({
  api,
  memoId,
  onSelect,
}: {
  api: MemoPickApi
  memoId: string | null
  onSelect(memoId: string | null): void
}) {
  const all = api.memos ?? []
  const missing = memoId !== null && api.memos !== undefined && !all.some((m) => m.id === memoId)
  return (
    <>
      <Row label="메모">
        <select
          className="ki-select"
          value={missing ? '' : (memoId ?? '')}
          onChange={(e) => onSelect(e.target.value || null)}
        >
          <option value="">{missing ? '지워진 메모' : '고르지 않음'}</option>
          {all.map((m) => (
            <option key={m.id} value={m.id}>
              {memoTitle(m.body, 30) || '새 메모'}
            </option>
          ))}
        </select>
      </Row>
      <div className="ki-buttons">
        <button
          type="button"
          onClick={async () => {
            const m = await api.create()
            if (m) onSelect(m.id)
          }}
        >
          새 메모 만들어 연결
        </button>
      </div>
    </>
  )
}

function Actions({ onDuplicate, onDelete }: { onDuplicate(): void; onDelete(): void }) {
  return (
    <div className="ki-buttons ki-actions">
      <button type="button" onClick={onDuplicate}>
        복제 <kbd>⌘D</kbd>
      </button>
      <button type="button" className="is-danger" onClick={onDelete}>
        삭제 <kbd>⌫</kbd>
      </button>
    </div>
  )
}

/** 투두 블록이 보여 줄 목록 고르기 + 목록 추가/이름 변경/삭제 */
function TodoListFields({
  lists,
  listId,
  onSelect,
}: {
  lists: TodoListsApi
  listId: string | null
  onSelect(listId: string | null): void
}) {
  const current = lists.all.find((l) => l.id === listId) ?? null
  const [newName, setNewName] = useState('')
  const [rename, setRename] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const shown = current ?? lists.all[0] ?? null

  return (
    <>
      <Row label="목록">
        <select
          className="ki-select"
          value={current?.id ?? ''}
          onChange={(e) => {
            setConfirmDelete(false)
            setRename(null)
            onSelect(e.target.value || null)
          }}
        >
          <option value="">기본 목록{lists.all[0] ? ` (${lists.all[0].name})` : ''}</option>
          {lists.all.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </Row>
      {shown && (
        <Row label="이름">
          <input
            className="ki-text"
            value={rename ?? shown.name}
            maxLength={40}
            onChange={(e) => setRename(e.target.value)}
            onBlur={() => {
              const name = rename?.trim()
              if (name && name !== shown.name) void lists.rename(shown.id, name)
              setRename(null)
            }}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          />
        </Row>
      )}
      <form
        className="ki-row"
        onSubmit={async (e) => {
          e.preventDefault()
          const name = newName.trim()
          if (!name) return
          const l = await lists.create(name)
          if (l) {
            setNewName('')
            onSelect(l.id)
          }
        }}
      >
        <input
          className="ki-text"
          placeholder="새 목록 이름"
          aria-label="새 목록 이름"
          value={newName}
          maxLength={40}
          onChange={(e) => setNewName(e.target.value)}
        />
        <button type="submit" className="ki-small">
          추가
        </button>
      </form>
      {current && lists.all.length > 1 && (
        <div className="ki-buttons">
          <button
            type="button"
            className="is-danger"
            onClick={async () => {
              if (!confirmDelete) return setConfirmDelete(true)
              setConfirmDelete(false)
              if (await lists.remove(current.id)) onSelect(null)
            }}
          >
            {confirmDelete ? '한 번 더 누르면 목록과 할 일이 지워져요' : '이 목록 삭제'}
          </button>
        </div>
      )}
    </>
  )
}

/** 타이머 프리셋(분): 1~180, 최대 6개, 최소 1개 */
function PresetFields({
  presets,
  onChange,
}: {
  presets: readonly number[]
  onChange(v: number[]): void
}) {
  const [draft, setDraft] = useState('')
  const add = () => {
    const n = Math.round(Number(draft))
    if (!Number.isFinite(n) || n < 1 || n > 180 || presets.includes(n)) return
    onChange([...presets, n].sort((a, b) => a - b))
    setDraft('')
  }
  return (
    <div className="ki-row ki-presets">
      <span className="ki-label">프리셋</span>
      <span className="ki-chips">
        {presets.map((m) => (
          <button
            key={m}
            type="button"
            className="ki-chip"
            disabled={presets.length <= 1}
            aria-label={`${m}분 프리셋 지우기`}
            onClick={() => onChange(presets.filter((x) => x !== m))}
          >
            {m}분 ×
          </button>
        ))}
        {presets.length < 6 && (
          <input
            className="ki-num"
            type="number"
            min={1}
            max={180}
            placeholder="분"
            aria-label="프리셋 추가(분)"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                add()
              }
            }}
            onBlur={add}
          />
        )}
      </span>
    </div>
  )
}
