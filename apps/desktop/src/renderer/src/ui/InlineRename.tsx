/**
 * 목록 안에서 바로 이름 고치기. Enter(한글 조합 중이 아닐 때)나 다른 곳을 누르면 저장, Escape는 취소.
 * 비었거나 그대로면 저장하지 않는다. 저장/취소 뒤 onClose.
 */
export function InlineRename({
  name,
  label,
  maxLength,
  className = 'pg-input',
  selectOnFocus = false,
  onRename,
  onClose,
}: {
  name: string
  /** aria-label */
  label: string
  maxLength: number
  className?: string
  /** 처음에 이름 전체를 고른 상태로 */
  selectOnFocus?: boolean
  onRename(name: string): void
  onClose(): void
}) {
  return (
    <input
      className={className}
      autoFocus
      defaultValue={name}
      maxLength={maxLength}
      aria-label={label}
      onFocus={selectOnFocus ? (e) => e.currentTarget.select() : undefined}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.nativeEvent.isComposing) e.currentTarget.blur()
        if (e.key === 'Escape') onClose()
      }}
      onBlur={(e) => {
        const v = e.currentTarget.value.trim()
        if (v && v !== name) onRename(v)
        onClose()
      }}
    />
  )
}
