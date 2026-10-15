import type { TimerDoneInfo } from '../../../shared/api'
import { PHASE_LABEL } from '../../../shared/pomodoro'

/** 앱 안 타이머 완료 표시(알림을 거부해도 보인다) */
export function TimerDoneBanner({ done, onDismiss }: { done: TimerDoneInfo; onDismiss(): void }) {
  return (
    <div className="app-banner" role="alert">
      <span>
        {done.mode === 'focus' ? '집중 시간이 끝났어요' : '쉬는 시간이 끝났어요'}
        {done.late && ' (앱이 꺼져 있는 동안)'}
        {done.next &&
          (done.next.started
            ? ` · ${PHASE_LABEL[done.next.phase]} 시작`
            : ` · 다음은 ${PHASE_LABEL[done.next.phase]}`)}
      </span>
      <button type="button" onClick={onDismiss}>
        확인
      </button>
    </div>
  )
}
