import { useState } from 'react'

/**
 * 두 번 눌러 실행하는 위험 버튼(삭제 등). 처음 누르면 confirmLabel로 바뀌고, 한 번 더 누르면 onConfirm.
 * 다른 곳으로 초점이 가면 처음 상태로 돌아간다. 다른 대상으로 바뀌면 key로 새로 만든다.
 */
export function ConfirmButton({
  label,
  confirmLabel,
  onConfirm,
  className = 'pg-pill is-danger',
  disabled,
}: {
  label: string
  confirmLabel: string
  onConfirm(): unknown
  className?: string
  disabled?: boolean
}) {
  const [armed, setArmed] = useState(false)
  return (
    <button
      type="button"
      className={className}
      disabled={disabled}
      onClick={() => {
        if (!armed) return setArmed(true)
        setArmed(false)
        void onConfirm()
      }}
      onBlur={() => setArmed(false)}
    >
      {armed ? confirmLabel : label}
    </button>
  )
}
