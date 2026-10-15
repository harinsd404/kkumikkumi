import type { Asset } from '@kkumikkumi/schema'
import { useEffect, useState } from 'react'
import { assetFileUrl } from './assetUrl'
import { ModalBackdrop } from './Modal'

const ERRORS: Record<string, string> = {
  nothing_left: '전부 지워져요. 지우는 정도를 낮춰 주세요',
  not_found: '이미지를 찾지 못했어요',
}

/**
 * 스티커 흰 배경 지우기 미리보기. 원본과 지운 결과를 체크무늬 위에 나란히 보여 주고,
 * 지우는 정도를 바꾸면 main이 새로 만든다(바뀔 때마다 0.25초 뒤). 원본 파일은 그대로 남는다.
 */
export function CutoutDialog({
  themeId,
  original,
  onUseOriginal,
  onUseCutout,
  onCancel,
}: {
  themeId: string
  original: Asset
  onUseOriginal(): void
  onUseCutout(asset: Asset): void
  onCancel(): void
}) {
  const [strength, setStrength] = useState(40)
  const [result, setResult] = useState<{ strength: number; asset: Asset } | null>(null)
  const [error, setError] = useState<{ strength: number; text: string } | null>(null)

  useEffect(() => {
    let alive = true
    const t = window.setTimeout(() => {
      void (async () => {
        const r = await window.kkumi.invoke('assets.removeWhiteBackground', {
          themeId,
          hash: original.hash,
          strength,
        })
        if (!alive) return
        if (r.ok) {
          setResult({ strength, asset: r.value.asset })
          setError(null)
        } else
          setError({ strength, text: ERRORS[r.error.code] ?? `지우지 못했어요 (${r.error.code})` })
      })()
    }, 250)
    return () => {
      alive = false
      window.clearTimeout(t)
    }
  }, [themeId, original.hash, strength])

  const ready = result !== null && result.strength === strength && !error
  const failed = error !== null && error.strength === strength

  return (
    <ModalBackdrop onClose={onCancel}>
      <div className="dlg cut" role="dialog" aria-modal="true" aria-labelledby="cut-title">
        <h2 id="cut-title" className="cut-title">
          흰 배경을 지울까요?
        </h2>
        <p className="cut-note">
          가장자리와 이어진 흰색만 지우고, 남은 그림 크기로 잘라요. 원본은 그대로 남아요.
        </p>
        <div className="cut-panes">
          <figure className="cut-pane">
            <div className="cut-check">
              <img src={assetFileUrl(themeId, original)} alt="원본" draggable={false} />
            </div>
            <figcaption>원본</figcaption>
          </figure>
          <figure className="cut-pane">
            <div className={`cut-check ${ready ? '' : 'is-busy'}`}>
              {failed ? (
                <p className="cut-error">{error.text}</p>
              ) : (
                result && (
                  <img
                    src={assetFileUrl(themeId, result.asset)}
                    alt="배경을 지운 결과"
                    draggable={false}
                  />
                )
              )}
            </div>
            <figcaption>배경 지움</figcaption>
          </figure>
        </div>
        <label className="cut-slider">
          <span>지우는 정도</span>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={strength}
            onChange={(e) => setStrength(Number(e.target.value))}
          />
          <output>{strength}</output>
        </label>
        <p className="cut-hint">흰 테가 남으면 올리고, 그림이 같이 지워지면 내려 주세요.</p>
        <div className="dlg-actions">
          <button type="button" onClick={onCancel}>
            취소
          </button>
          <span className="dlg-spacer" />
          <button type="button" onClick={onUseOriginal}>
            원본 그대로
          </button>
          <button
            type="button"
            className="is-primary"
            disabled={!ready}
            onClick={() => result && onUseCutout(result.asset)}
          >
            배경 지우고 넣기
          </button>
        </div>
      </div>
    </ModalBackdrop>
  )
}
