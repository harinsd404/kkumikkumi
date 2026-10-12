import type { GridBlock } from '@kkumikkumi/schema'
import { useBoard } from '../BoardContext'
import { imageCss } from '../style'

type ImageBlockT = Extract<GridBlock, { type: 'image' }>

export function ImageBlock({ block }: { block: ImageBlockT }) {
  const { theme, assetUrl } = useBoard()
  const url = block.props.assetHash ? assetUrl(block.props.assetHash) : null
  const css = imageCss(block.props)

  if (!url) {
    // 빈 이미지: 팔레트 면 색으로 자리만 표시
    return (
      <div
        className="kb-fill"
        style={{ ...css.frame, background: theme.defaults.palette.surface }}
      />
    )
  }
  return (
    <div className="kb-fill" style={css.frame}>
      <img src={url} alt="" style={css.img} draggable={false} />
    </div>
  )
}
