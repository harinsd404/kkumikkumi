import { AssetImage } from '../../ui/AssetImage'
import {
  DIARY_MAX_CHARS,
  DIARY_MAX_PHOTOS,
  type DiaryEntry,
  type DiaryPhoto,
} from '@kkumikkumi/schema'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ModalBackdrop } from '../../app/Modal'
import { MOODS, moodEmoji, moodLabel } from '../../board/diary'
import { ConfirmButton } from '../../ui/ConfirmButton'
import { monthDayKo, weekdayLabel } from '../dateText'
import { diaryPhotoUrl, type DiaryApi, type DiarySave } from './useDiary'

const title = (date: string) => `${monthDayKo(date)} (${weekdayLabel(date)})`

/** 할 일 화면 왼쪽: 고른 날의 일기 미리보기(기분, 글 몇 줄, 사진). 누르면 일기 창 */
export function DiaryCard({
  date,
  entry,
  onOpen,
}: {
  date: string
  /** undefined = 불러오는 중 */
  entry: DiaryEntry | null | undefined
  onOpen(): void
}) {
  const mood = moodEmoji(entry?.mood)
  return (
    <section className="tdo-diary" aria-label="일기">
      <div className="tdo-diary-head">
        <h2 className="pg-chip">일기 · {title(date)}</h2>
        <span className="pg-spacer" />
        <button type="button" className="pg-pill" onClick={onOpen}>
          {entry ? '이어 쓰기' : '일기 쓰기'}
        </button>
      </div>
      {entry ? (
        <button type="button" className="tdo-diary-preview" onClick={onOpen}>
          {mood && (
            <span className="tdo-diary-mood" title={moodLabel(entry.mood) ?? ''}>
              {mood}
            </span>
          )}
          <span className="tdo-diary-text">{entry.body.trim() || '사진만 남긴 날'}</span>
          {entry.photos.length > 0 && (
            <span className="tdo-diary-thumbs">
              {entry.photos.map((p) => (
                <AssetImage key={p.hash} src={diaryPhotoUrl(p)} alt="" draggable={false} />
              ))}
            </span>
          )}
        </button>
      ) : (
        entry === null && <p className="pg-empty">아직 일기가 없어요</p>
      )}
    </section>
  )
}

/** 일기 쓰기 창: 기분, 글(쓰는 동안 자동 저장), 사진(최대 4장, 끌어 놓기 가능) */
export function DiaryDialog({
  date,
  entry,
  api,
  onClose,
}: {
  date: string
  entry: DiaryEntry | null
  api: DiaryApi
  onClose(): void
}) {
  const [body, setBody] = useState(entry?.body ?? '')
  const [mood, setMood] = useState<number | null>(entry?.mood ?? null)
  const [photos, setPhotos] = useState<DiaryPhoto[]>(entry?.photos ?? [])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const timer = useRef<number | undefined>(undefined)
  const pendingBody = useRef<string | null>(null)

  const save = (patch: DiarySave) => void api.save(date, patch)
  // 글은 멈추면 저장하고, 창을 닫을 때 남은 것을 저장한다
  const flushBody = () => {
    window.clearTimeout(timer.current)
    if (pendingBody.current !== null) {
      save({ body: pendingBody.current })
      pendingBody.current = null
    }
  }
  // 창이 close 없이 사라져도(화면 전환 등) 남은 글을 저장한다
  const flushRef = useRef(flushBody)
  useLayoutEffect(() => {
    flushRef.current = flushBody
  })
  useEffect(() => () => flushRef.current(), [])
  const close = () => {
    flushBody()
    onClose()
  }

  const adding = useRef(false)
  // 넣는 중에는 다음 사진을 받지 않는다(같은 목록에서 출발해 하나가 사라지지 않도록)
  const addPhoto = async (src: { dialog: true } | { bytes: Uint8Array }) => {
    if (adding.current) return
    if (photos.length >= DIARY_MAX_PHOTOS) return setError(`사진은 ${DIARY_MAX_PHOTOS}장까지예요`)
    adding.current = true
    setBusy(true)
    setError(null)
    const p = await api.addPhoto(src)
    adding.current = false
    setBusy(false)
    if (!p) return 'dialog' in src ? undefined : setError('사진을 넣지 못했어요')
    if (photos.some((x) => x.hash === p.hash)) return
    const next = [...photos, p]
    setPhotos(next)
    save({ photos: next })
  }

  return (
    <ModalBackdrop onClose={close} busy={busy}>
      <div
        className="dlg tdo-diary-dlg"
        role="dialog"
        aria-modal="true"
        aria-label={`${title(date)} 일기`}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          const f = e.dataTransfer.files[0]
          if (f) void f.arrayBuffer().then((b) => addPhoto({ bytes: new Uint8Array(b) }))
        }}
      >
        <h2 className="td-title">{title(date)} 일기</h2>
        <div className="tdo-moods" role="radiogroup" aria-label="오늘 기분">
          {MOODS.map((m) => (
            <button
              key={m.value}
              type="button"
              role="radio"
              aria-checked={mood === m.value}
              onClick={() => {
                const next = mood === m.value ? null : m.value
                setMood(next)
                save({ mood: next })
              }}
            >
              <span className="tdo-mood-emoji">{m.emoji}</span>
              <span className="tdo-mood-label">{m.label}</span>
            </button>
          ))}
        </div>
        <textarea
          className="pg-input tdo-diary-body"
          placeholder="오늘 있었던 일, 느낀 점을 적어 보세요"
          aria-label="일기"
          maxLength={DIARY_MAX_CHARS}
          autoFocus
          value={body}
          onChange={(e) => {
            setBody(e.target.value)
            pendingBody.current = e.target.value
            window.clearTimeout(timer.current)
            timer.current = window.setTimeout(flushBody, 600)
          }}
          onBlur={flushBody}
        />
        <div className="tdo-diary-photos">
          {photos.map((p) => (
            <figure key={p.hash}>
              <AssetImage src={diaryPhotoUrl(p)} alt="" draggable={false} />
              <button
                type="button"
                aria-label="사진 빼기"
                onClick={() => {
                  const next = photos.filter((x) => x.hash !== p.hash)
                  setPhotos(next)
                  save({ photos: next })
                }}
              >
                ×
              </button>
            </figure>
          ))}
          {photos.length < DIARY_MAX_PHOTOS && (
            <button
              type="button"
              className="tdo-diary-add"
              disabled={busy}
              onClick={() => void addPhoto({ dialog: true })}
            >
              + 사진
              <span>끌어 놓아도 돼요</span>
            </button>
          )}
        </div>
        {error && (
          <p className="dlg-error" role="alert">
            {error}
          </p>
        )}
        <div className="dlg-actions">
          {(entry || body.trim() || mood !== null || photos.length > 0) && (
            <ConfirmButton
              label="일기 지우기"
              confirmLabel="정말 지울까요?"
              onConfirm={async () => {
                window.clearTimeout(timer.current)
                pendingBody.current = null
                await window.kkumi.invoke('diary.delete', { date })
                await api.save(date, {}) // 다시 읽기
                onClose()
              }}
            />
          )}
          <span className="dlg-spacer" />
          <button type="button" className="is-primary" onClick={close} disabled={busy}>
            다 썼어요
          </button>
        </div>
      </div>
    </ModalBackdrop>
  )
}
