import type { MiniTimerPrefs, PomodoroSettings, Theme } from '@kkumikkumi/schema'
import { useEffect, useState } from 'react'
import type { AppFolder, SettingsSection } from '../../../shared/api'
import type { ThemeMenu } from '../app/TitleBar'
import type { BoardData } from '../board/BoardContext'
import { McpSection } from './settings/McpSection'
import { ThemeSection } from './settings/ThemeSection'
import { PomodoroSettingsForm } from './TimerPage'

// 설정 페이지: 지금 있는 앱 설정을 한곳에 모은다(테마, 타이머, AI 연결, 정보).
// 펫 켜기/끄기와 테마 자동 전환은 기능이 생길 때(M5, M6) 이 페이지에 붙인다.

interface Props {
  /** 없으면(테마 바꾸기를 못 할 때) 테마 구역은 이름만 */
  themeMenu: ThemeMenu | undefined
  /** 지금 테마(미리보기) */
  theme: Theme
  /** 미리보기에 쓰는 지금 데이터(할 일, 일정, 메모 …) */
  data: BoardData
  now: Date
  pomodoro: PomodoroSettings | undefined
  updatePomodoro(patch: Partial<PomodoroSettings>): Promise<boolean>
  /** 앱 메뉴에서 바로 보여 줄 구역 */
  section: SettingsSection | null
  showNotice(text: string): void
}

export function SettingsPage(p: Props) {
  // 앱 메뉴 "AI 연결…"로 들어오면 그 구역으로 스크롤
  useEffect(() => {
    if (p.section) document.getElementById(`settings-${p.section}`)?.scrollIntoView()
  }, [p.section])

  return (
    <div className="pg pg-settings">
      <div className="st-col">
        <h1 className="pg-title">설정</h1>
        <ThemeSection menu={p.themeMenu} current={p.theme} data={p.data} now={p.now} />
        <TimerSection pomodoro={p.pomodoro} update={p.updatePomodoro} showNotice={p.showNotice} />
        <McpSection highlight={p.section === 'mcp'} />
        <InfoSection showNotice={p.showNotice} />
      </div>
    </div>
  )
}

function TimerSection({
  pomodoro,
  update,
  showNotice,
}: {
  pomodoro: PomodoroSettings | undefined
  update(patch: Partial<PomodoroSettings>): Promise<boolean>
  showNotice(text: string): void
}) {
  const [mini, setMini] = useState<MiniTimerPrefs | null>(null)
  useEffect(() => {
    void (async () => {
      const r = await window.kkumi.invoke('miniTimer.prefs')
      if (r.ok) setMini(r.value)
    })()
  }, [])
  const setPin = async (alwaysOnTop: boolean) => {
    const r = await window.kkumi.invoke('miniTimer.update', { patch: { alwaysOnTop } })
    if (r.ok) setMini(r.value)
    else showNotice('저장하지 못했어요')
  }
  return (
    <section className="pg-card st-card" aria-labelledby="st-timer">
      <h2 id="st-timer" className="pg-chip">
        타이머
      </h2>
      <h3 className="st-sub">뽀모도로</h3>
      {pomodoro ? (
        <PomodoroSettingsForm set={pomodoro} update={update} />
      ) : (
        <p className="st-note">불러오는 중…</p>
      )}
      <h3 className="st-sub">미니 타이머</h3>
      <label className="tp-toggle st-toggle">
        <input
          type="checkbox"
          checked={mini?.alwaysOnTop ?? false}
          disabled={!mini}
          onChange={(e) => void setPin(e.target.checked)}
        />
        <span>항상 다른 창 위에 띄우기</span>
      </label>
    </section>
  )
}

function InfoSection({ showNotice }: { showNotice(text: string): void }) {
  const [version, setVersion] = useState<string | null>(null)
  useEffect(() => {
    void (async () => {
      const r = await window.kkumi.invoke('app.info')
      if (r.ok) setVersion(r.value.version)
    })()
  }, [])
  const open = async (folder: AppFolder) => {
    const r = await window.kkumi.invoke('app.openFolder', { folder })
    if (!r.ok) showNotice('폴더를 열지 못했어요')
  }
  return (
    <section className="pg-card st-card" aria-labelledby="st-info">
      <h2 id="st-info" className="pg-chip">
        정보
      </h2>
      <p className="st-note">꾸미꾸미 {version ?? ''}</p>
      <div className="pg-tabs">
        <button type="button" className="pg-pill" onClick={() => void open('logs')}>
          오류 기록 폴더 열기
        </button>
        <button type="button" className="pg-pill" onClick={() => void open('userData')}>
          데이터 폴더 열기
        </button>
      </div>
      <p className="st-note">
        오류 기록에는 오류 종류만 남고 할 일·일정 같은 내용은 남지 않아요. 데이터 폴더의 파일을 직접
        고치면 앱이 열리지 않을 수 있어요.
      </p>
    </section>
  )
}
