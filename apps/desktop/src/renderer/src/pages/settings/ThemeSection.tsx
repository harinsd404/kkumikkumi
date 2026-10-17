import type { Theme } from '@kkumikkumi/schema'
import { useEffect, useMemo, useState } from 'react'
import { Board } from '../../board/Board'
import type { BoardData } from '../../board/BoardContext'
import { makeAssetUrl } from '../../app/assetUrl'
import { ColorDots } from '../../app/ThemeDialog'
import type { ThemeMenu } from '../../app/TitleBar'

// 설정 페이지 "테마": 테마마다 실제 보드 미리보기(지금 데이터) + 이름. 누르면 그 테마로 바꾼다.

interface Props {
  /** 없으면(테마 바꾸기를 못 할 때) 지금 테마 미리보기만 */
  menu: ThemeMenu | undefined
  /** 지금 테마(편집 중 저장 전 변경까지 반영된 화면의 테마) */
  current: Theme
  data: BoardData
  now: Date
}

/** 미리보기용 테마 읽기. 목록이 바뀌면(다시 읽기, 수정) 다시 읽는다. 못 읽으면 null(색 점만). */
function useThemePreviews(ids: readonly string[], currentId: string) {
  const [themes, setThemes] = useState<ReadonlyMap<string, Theme | null>>(new Map())
  const key = ids.join(',')
  useEffect(() => {
    let alive = true
    void (async () => {
      const next = new Map<string, Theme | null>()
      for (const id of key.split(',')) {
        if (!id || id === currentId) continue
        const r = await window.kkumi.invoke('themes.get', { id })
        next.set(id, r.ok ? r.value : null)
      }
      if (alive) setThemes(next)
    })()
    return () => {
      alive = false
    }
  }, [key, currentId])
  return themes
}

export function ThemeSection({ menu, current, data, now }: Props) {
  // 목록을 최신으로(다른 곳에서 만들거나 지운 테마)
  const onOpen = menu?.onOpen
  useEffect(() => onOpen?.(), [onOpen])
  const list = useMemo(
    () => menu?.themes ?? [{ id: current.id, name: current.name, builtin: false, colors: [] }],
    [menu?.themes, current.id, current.name],
  )
  const loaded = useThemePreviews(
    list.map((t) => t.id),
    current.id,
  )

  return (
    <section className="pg-card st-card" aria-labelledby="st-theme">
      <h2 id="st-theme" className="pg-chip">
        테마
      </h2>
      <ul className="st-themes" aria-label="테마 고르기">
        {list.map((t) => {
          const isCurrent = t.id === current.id
          const theme = isCurrent ? current : loaded.get(t.id)
          return (
            <li key={t.id}>
              <button
                type="button"
                className={`st-theme ${isCurrent ? 'is-current' : ''}`}
                aria-pressed={isCurrent}
                disabled={isCurrent || !menu}
                onClick={() => menu?.onSelect(t.id)}
              >
                <ThemeThumb theme={theme} data={data} now={now} />
                <span className="st-theme-row">
                  <ColorDots colors={t.colors} />
                  <span className="st-theme-name">{t.name}</span>
                  {isCurrent && <span className="st-tag">사용 중</span>}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
      {menu && (
        <div className="pg-tabs">
          <button type="button" className="pg-pill" onClick={menu.onCreate}>
            새 테마 만들기
          </button>
          <button type="button" className="pg-pill" onClick={menu.onManage}>
            테마 관리
          </button>
        </div>
      )}
    </section>
  )
}

/** 16:10 축소 보드. undefined = 읽는 중, null = 못 읽음 */
function ThemeThumb({
  theme,
  data,
  now,
}: {
  theme: Theme | null | undefined
  data: BoardData
  now: Date
}) {
  const assetUrl = useMemo(() => (theme ? makeAssetUrl(theme) : null), [theme])
  return (
    <span className={`st-thumb ${theme === null ? 'is-broken' : ''}`} aria-hidden>
      {theme && assetUrl && (
        // edit 모드: 미리보기 안에서 체크·클릭 같은 동작이 일어나지 않게
        <Board theme={theme} assetUrl={assetUrl} data={data} mode="edit" now={now} />
      )}
      {theme === null && <span className="st-thumb-note">미리보기를 불러오지 못했어요</span>}
    </span>
  )
}
