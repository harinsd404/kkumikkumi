import { AssetImage } from '../ui/AssetImage'
import type { FreeItem } from '@kkumikkumi/schema'
import { useBoard } from './BoardContext'
import { decorCss, imageCss } from './style'

export function FreeItemView({ item }: { item: FreeItem }) {
  const { theme, assetUrl, mode } = useBoard()
  const base = {
    left: item.x,
    top: item.y,
    width: item.w,
    height: item.h,
    transform: item.rotation ? `rotate(${item.rotation}deg)` : undefined,
    ...decorCss(item.decor, theme.defaults.palette),
  }

  if (item.kind === 'image') {
    const url = item.content.assetHash ? assetUrl(item.content.assetHash) : null
    const css = imageCss(item.content)
    return (
      <div className="kb-abs" style={{ ...base, ...css.frame }}>
        {url ? (
          <AssetImage src={url} alt="" style={css.img} draggable={false} />
        ) : (
          <div className="kb-fill" style={{ background: theme.defaults.palette.surface }} />
        )}
      </div>
    )
  }

  // 스티커: asset이면 이미지, builtin은 아직 등록된 스티커가 없어 편집 모드에서만 자리 표시
  const url = item.source.type === 'asset' ? assetUrl(item.source.hash) : null
  return (
    <div
      className="kb-abs"
      style={base}
      data-sticker={item.source.type === 'builtin' ? item.source.id : undefined}
    >
      {url ? (
        <AssetImage
          className="kb-fill"
          src={url}
          alt=""
          style={{ objectFit: 'contain' }}
          draggable={false}
        />
      ) : mode === 'edit' ? (
        <div className="kb-fill kb-missing" />
      ) : null}
    </div>
  )
}
