import { useEffect, useRef, type ImgHTMLAttributes } from 'react'
import { recoverImage } from './imageRecovery'

type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'srcSet'> & { src: string }

export function AssetImage(props: Props) {
  // A different asset starts a new load/recovery lifecycle, without a stale timer.
  return <RecoveringImage key={props.src} {...props} />
}

function RecoveringImage({ src, ...props }: Props) {
  const ref = useRef<HTMLImageElement>(null)
  useEffect(() => {
    if (ref.current) return recoverImage(ref.current, src)
  }, [src])
  return <img {...props} src={src} ref={ref} />
}
