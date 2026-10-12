# 프로젝트: 꾸미꾸미 (kkumikkumi) — 데스크탑 꾸미기 앱

## 개요

macOS 우선(Windows는 추후 검토)의 데스크탑 앱. 사용자가 일반 창 안의 "보드"를 위젯 블록으로 꾸민다.
기능: 투두, 캘린더(내부 일정), 타이머, 데스크탑 펫, 다중 테마와 자동 전환, 테마 파일 내보내기/가져오기.
스케치: 보드 안에 캘린더(좌, 큼), 이미지(우상), 투두(우하).

## 이름

- 표시 이름: 꾸미꾸미. 내부 식별자(패키지 스코프 @kkumikkumi/\*, 폴더, 실행 파일명): kkumikkumi.
- 번들 ID의 도메인 부분은 미정. 이름/번들 ID/아이콘은 한 곳의 상수로 분리해 둔다(M8).
- 상표/스토어/도메인 충돌은 아직 확인하지 않았다(사용자가 확인 예정). 기본 펫(마스코트) 이름 "꾸이"는 제안일 뿐 미확정.

## 확정 결정사항

- 스택: Electron + React + TypeScript(strict), Vite 기반, pnpm 모노레포.
- 보드는 일반 창이다(바탕화면 레벨 아님). 펫은 별도 창이다.
- 레이아웃
  - 그리드 블록: 크기는 S/M/L만, 퍼즐처럼 배치. 타입은 calendar, todo, timer, image.
  - 자유 배치 레이어: 스티커와 이미지. 위치/크기/회전/z-order, back/front 레이어.
  - 이미지 블록: 그리드 image 블록과 자유 image 아이템이 같은 ImageContent 구조를 공유.
- 리사이즈: 고정 논리 캔버스(1600x1000, 8x5 그리드)를 균일 스케일로 그리고 창 비율을 잠근다. 반응형 재배치 없음.
- 데이터: 로컬 전용(계정/서버/동기화 없음). 모든 엔티티에 UUID, schemaVersion, updatedAt. outbox/tombstone/deviceId는 만들지 않는다.
- 저장: 사용자 데이터는 SQLite(node:sqlite, 2026-10-12 결정 — better-sqlite3는 Electron 44 prebuild 없음), 테마는 폴더(theme.json + assets/<hash>.<ext>).
- 에셋: sharp로 재인코딩. 저장 포맷은 PNG/JPEG로 정규화(WebP는 투명이면 PNG, 아니면 JPEG), 펫은 PNG만. 긴 변 상한 image 3200px / pet 512px.
- 캘린더: 내부 일정만. 시각 일정은 startUtc/endUtc + tzid, 종일 일정은 날짜 문자열. 반복 일정은 MVP 제외(recurrence: null 예약).
- 타이머: setInterval 카운트다운 금지. endsAt 타임스탬프로 남은 시간 계산. 절전 복귀/앱 재시작 후 복원.
- 폰트: 번들 폰트 목록에서만 선택. 테마에는 fontId만 저장, 없는 ID는 기본 폰트로 대체. OFL 계열만 번들, 라이선스 확인 후 docs/fonts.md에 기록.
- 테마 공유: 서버 없이 zip 내보내기/가져오기. 테마에는 외형, 배치, 펫, 에셋만 포함. 투두/일정/타이머/자동전환 규칙은 제외.
- 펫
  - 상태: rest, music, typing. 우선순위 typing > music > rest.
  - 에셋: 상태별 PNG 최대 3장, rest 필수, 없는 상태는 rest로 대체. 기본 펫은 앱 내장(builtin, 자체 제작 에셋만).
  - 정지 이미지이므로 움직임은 절차적 애니메이션(좌우 반전, 바운스, 이동).
  - 펫은 테마에 포함된다. on/off는 전역 설정이며 off면 창, 감지 폴링, 헬퍼 프로세스를 완전히 종료.
  - 타이핑 감지는 "마지막 키 입력 이후 경과 시간"만 사용. 키 내용/키 코드는 읽지도 저장하지도 로깅하지도 않는다.
  - 음악 감지는 인터페이스만 만들고 스텁. 다른 앱 창 위를 걷는 기능은 MVP 제외.
- 테마 자동 전환: 시간대(자정 넘김 가능), 요일, 모드(focus = 타이머 실행 중), 시스템 외형(light/dark). 겹치면 priority. 수동 전환은 manualOverride(until=null이면 해제 전까지).
- OS 의존 코드는 PlatformAdapter 인터페이스 뒤에 둔다. macOS만 구현, Windows는 미지원 스텁.
- 배포: 직접 배포(DMG), 코드 서명 + 공증. 앱스토어 샌드박스는 고려하지 않는다.

## 가정 (미확정, 변경 가능)

- 창 비율 전역 고정(16:10).
- 크기표와 그리드(디자인 캔버스 기준, 2026-10-12 시드 반영): 8x5 그리드(1칸 200px), S=2x1, M=2x2, L=4x3. 허용 크기: calendar M/L, todo S/M/L, timer S/M, image S/M/L. 단일 출처는 packages/schema의 SIZE_CELLS/ALLOWED_SIZES.
- 이미지 블록/스티커 업로드는 PNG/JPG/WebP 허용, 펫 이미지는 PNG만.
- 펫 이동 방식(작은 창 이동 vs 하단 오버레이)은 M0 스파이크 결과로 결정.

## 아키텍처 원칙

- main: 파일, DB, 창, OS 연동, 가져오기 검증. renderer: UI만. 둘 사이는 타입 있는 IPC(preload는 최소 API만 노출). main은 renderer 입력을 zod로 재검증한다.
- 보드 렌더러는 electron을 import하지 않는 순수 React로 작성(추후 웹 미리보기 재사용 가능).
- 스키마(zod)는 packages/schema가 단일 출처. 저장, 가져오기, IPC 경계에서 반드시 검증.
- 시간/규칙/충돌 판정 로직은 순수 함수로 분리하고 단위 테스트를 작성.

## 보안/프라이버시 규칙

- contextIsolation: true, nodeIntegration: false, sandbox: true, 엄격한 CSP, 외부 URL 탐색/새 창 차단.
- 가져오기 파일은 신뢰할 수 없는 입력: zip-slip, 엔트리 수/용량/압축비 제한, 확장자 허용 목록, 스키마 검증, 이미지 디코딩 후 재인코딩 + 해시 재계산, 모든 ID 재발급, todo.listId는 null로 치환, 원시 CSS/HTML 금지, SVG 금지. 전부 성공했을 때만 원자적으로 저장.
- 키 입력 내용은 어디에도 기록하지 않는다. 로그에 사용자 데이터(할 일 제목, 일정, 이미지 경로)를 남기지 않는다.

## 불확실 항목 (구현 전에 공식 문서로 확인)

확인되면 docs/verified-facts.md에 (항목 / 결론 / 출처 URL / 버전 / 확인일)로 기록한다. 확인하지 못했으면 추측으로 구현하지 말고 사용자에게 질문한다.

- U1: setAspectRatio의 프레임/타이틀바(extraSize) 처리, macOS와 Windows 차이
- U2: 항상 위 + 풀스크린/다른 Space 위 표시(setAlwaysOnTop 레벨, setVisibleOnAllWorkspaces visibleOnFullScreen)와 Dock 부작용
- U3: setIgnoreMouseEvents(true, { forward: true })의 플랫폼 지원과 "펫 위에서만 클릭" 패턴
- U4: 키보드 전용 경과 시간(CGEventSourceSecondsSinceLastEventType)의 권한 요구, koffi vs Swift 헬퍼, 서명/공증 영향
- U5: macOS 음악 재생 감지(MediaRemote 제한 여부, 공개 API 대안과 권한)
- U6: 투명 창 상시 애니메이션의 CPU/GPU/배터리 비용, 작은 창 이동 vs 오버레이 내부 CSS 이동
- U7: 직접 배포 서명/공증 최소 entitlements, 네이티브 모듈/헬퍼 서명, notarytool 인증 방식
- U8: electron-vite 유지보수, better-sqlite3 + Electron + pnpm 리빌드/패키징, node:sqlite 사용 가능 여부, sharp 패키징, nativeImage WebP 지원
- U9: 번들 한글 폰트 라이선스(Pretendard, Noto Sans KR 등) 재배포/서브셋 조건
- U10: (낮음) 사용자 업로드 이미지 테마 공유의 한국 법적 쟁점
- U11: Electron Notification의 macOS 권한 처리

## 타 AI 조사 결과 평가 (전부 미검증)

다른 AI의 답변은 출처 URL 없이 "확신도 높음"으로만 적혀 있어 사실로 취급하지 않는다. 아래는 작성자가 가진 의심점이며 이것도 확인 전까지는 확정이 아니다. 항목별로 공식 문서나 실측으로 확인한 뒤 docs/verified-facts.md에 기록한다.

- 환경: "macOS 27 Golden Gate", "Electron 43/44"는 미검증. 설치된 실제 버전과 사용자 Mac의 실제 macOS 버전을 기준으로 한다.
- U1: 답변은 프레임/타이틀바 높이를 extraSize로 넘기라고 했으나, extraSize는 콘텐츠 뷰 "안"의 추가 UI 영역용이고 창-콘텐츠 크기 차이는 API가 이미 반영하는 것으로 알고 있다(확인 필요). extraSize 0 + useContentSize로 시작해 macOS에서 실측. Windows 버그 주장은 근거 없음.
- U2: setAlwaysOnTop('screen-saver') + setVisibleOnAllWorkspaces({ visibleOnFullScreen: true }) 조합은 후보로 유지. skipTransformProcessType은 옵션이 존재하는 것으로 알지만 용도는 프로세스 타입 전환 시 창/Dock 깜빡임 회피로 알고 있어, 답변의 "Z-order 제약" 설명은 근거 없음. app.dock.hide()와의 관계는 M0에서 실측.
- U3: forward는 macOS/Windows 지원(재확인). 답변 예시는 ipcRenderer를 renderer에서 직접 쓰므로 본 프로젝트에서는 preload 경유로 바꾼다. elementFromPoint는 PNG의 투명 픽셀을 구분하지 못하므로 알파 기반 히트 테스트가 필요한지 M0에서 확인.
- U4: "권한 불필요"는 Apple 문서 근거 없는 추론이므로 실측으로 확인(권한 프롬프트 발생 여부). 답변의 예시 코드는 틀렸다: (a) 상태 ID는 kCGEventSourceStateCombinedSessionState=0, kCGEventSourceStateHIDSystemState=1로 알고 있음. (b) 키보드 전용이어야 하므로 kCGAnyInputEventType이 아니라 kCGEventKeyDown(값 10으로 알고 있음)을 써야 마우스 입력이 섞이지 않는다. 상수는 SDK 헤더/문서로 재확인.
- U5: MediaRemote 제한은 이전 정보와 일치하나 인용된 이슈 번호와 entitlement 이름은 미검증. AppleScript(Music/Spotify) 방식은 Hardened Runtime에서 com.apple.security.automation.apple-events entitlement와 NSAppleEventsUsageDescription이 필요한 것으로 알고 있다(확인 필요, U7에 영향). MVP는 스텁 유지.
- U6: "3~5배" 같은 수치는 근거 없음. 방향(작은 창 이동 우선)만 참고하고 M0 실측으로 판단.
- U7: JIT 관련 entitlements는 일반적 구성이나 "최소 집합" 주장은 미확인. 예시 yml의 notarize 설정 형식이 설치된 electron-builder 버전과 맞는지 확인. 인증 방식(API 키 권장) 근거가 약하므로 공식 문서 확인.
- U8: nativeImage가 WebP를 인코딩/디코딩한다는 주장은 공식 문서(지원 포맷 PNG/JPEG, toBitmap은 raw 픽셀)와 어긋나는 것으로 알고 있다. WebP는 sharp 또는 renderer(canvas) 디코딩 경유 중 선택하고 실측으로 결정, 저장 포맷은 PNG/JPEG로 정규화하는 안을 우선 검토. node:sqlite 설명은 버전 정보가 부정확해 보이므로 better-sqlite3를 기본으로 유지. electron-vite 상태와 버전은 npm에서 직접 확인.
- U9: "OFL은 번들/서브셋 허용"이라는 일반 결론은 맞으나 RFN 유무는 폰트마다 다르다. 서브셋은 수정에 해당하므로 각 폰트의 OFL 파일과 저작권 문구에서 RFN을 직접 확인.
- U10: 조문 번호는 국가법령정보센터에서 직접 확인(저작권법 제102조, 제103조 외에, 답변이 쓴 "전송권"은 현행 법령에서는 "공중송신권" 용어일 가능성). "지정수령인 공시" 요건은 근거 불명. 법률 자문 아님.
- U11: 메인 프로세스 Notification에는 권한 상태 조회 API가 없는 것으로 알고 있고(확인 필요), app.setAppUserModelId는 Windows용이다. 알림 거부를 감지할 수 없다고 가정하고 앱 내 표시를 항상 병행한다.

## 작업 방식

- 마일스톤은 한 번에 하나만 진행한다. 구현 전에 계획(도구/버전, 구조, 위험)을 먼저 보여주고 승인을 받는다.
- "다음 진행" 같은 지시가 오면 체크되지 않은 가장 앞 마일스톤을 진행한다.
- 모르는 API는 공식 문서나 설치된 패키지 타입으로 확인한다. 확인하지 못한 것은 "확실하지 않음"이라고 명시하고 추측으로 구현하지 않는다.
- Electron API 확인은 설치된 패키지의 타입 정의(node_modules/electron/electron.d.ts의 JSDoc, 플랫폼 표기 포함 — 있는 것으로 알고 있으나 확인 필요)와 공식 문서를 우선한다.
- 의존성 추가 시 이유와 대안을 한 줄로 기록한다. 네이티브 모듈은 최소화.
- Claude Code가 화면을 볼 수 없는 항목(창 동작, 드래그 느낌 등)은 수동 확인 체크리스트로 제공한다.
- 단계 종료 시 보고: (1) 변경 요약 (2) 실행한 검증 명령과 실제 결과 (3) 남은 위험과 미해결 항목 (4) 내가 수동으로 확인할 항목. 보고 후 멈춘다.
- 단계가 끝나면 아래 체크박스를 갱신하고 git 커밋한다.

## 마일스톤

- 순서 변경(2026-10-12, 사용자 지시): 펫(M0 스파이크, M5 통합)은 데스크탑 보드 구현(M1~M4) 이후로 미룬다. 진행 순서는 아래 나열 순서를 따른다.

- [x] **P0 골격 + 스키마 패키지**
  - pnpm 워크스페이스: apps/desktop(@kkumikkumi/desktop), packages/schema(@kkumikkumi/schema) (spikes/는 워크스페이스 밖).
  - apps/desktop: electron-vite 기반 Electron + React + TS strict. 문제가 있으면 대안(electron-forge + vite 등)을 근거와 함께 제시하고 결정을 기다린다.
  - 보안 기본값 적용, ESLint/Prettier(최소), Vitest. 루트 스크립트: dev, build, typecheck, lint, test.
  - (완료) \_seed/theme.ts, userdata.ts를 packages/schema/src로 옮겨 export. \_seed/validate.seed.ts의 케이스를 Vitest로 포팅(스케치 레이아웃, 겹침, calendar S 금지, 범위 초과, 없는 에셋 참조, 펫 PNG 아님, 미지의 키 거부, 캔버스 밖 아이템, 중복 에셋/ID, 기본 펫, 타이머/일정/규칙 제약). 끝나면 \_seed/ 삭제.
  - 그리드 판정 순수 함수(canPlace, findFreeSlot)를 schema 패키지에서 export하고 테스트.

- [x] **M1 저장소, 에셋, IPC**
  - SQLite(better-sqlite3 우선 검토, 문제 시 대안 비교). main에서만 연다. PRAGMA user_version 마이그레이션 러너 + 테스트. 테이블: todo_lists, todo_items, calendar_events, timer_state, theme_rules, settings. 리포지토리(DB 핸들 주입) + zod 검증 + in-memory 테스트.
  - 테마 저장소: userData/themes/<id>/theme.json + assets/. 원자적 저장(임시 파일 후 rename), 복제, 삭제, 고아 에셋 prune, 읽기 시 검증(실패해도 파일은 건드리지 않음), 스키마 마이그레이션 훅. 첫 실행 시 스케치 레이아웃 기본 테마 생성.
  - 에셋 파이프라인(main): PNG/JPG/WebP(펫은 PNG만), LIMITS 적용, 디코딩 → 축소 → 재인코딩 → sha256(재인코딩 바이트) → assets/<hash>.<ext>. nativeImage vs sharp 비교 후 선택. PNG 알파 유무 판별 함수(경고용). 손상/확장자 위조/과대 해상도 테스트.
  - 타입 있는 IPC + main 재검증. themes, assets.import, settings, todo/calendar/timer CRUD.

- [ ] **M2 보드 렌더러(읽기 전용)**
  - 순수 React. 논리 캔버스를 transform: scale로 균일 스케일. setAspectRatio로 창 비율 잠금(extraSize 고려), 최소 창 크기, 창 크기/위치 저장·복원.
  - 렌더 순서: 배경 → back 자유 아이템 → 그리드 블록 → front 자유 아이템(레이어 내 z 순서).
  - StyleSchema/DecorSchema → CSS 변환 함수(shadow 프리셋 매핑 등). 원시 CSS 문자열 경로 금지.
  - calendar/todo/timer는 크기별 플레이스홀더. image 블록은 fit/focus/zoom/shape 반영. 스티커 레지스트리(builtin + asset).
  - 번들 폰트 레지스트리(fontId → woff2, 라이선스 표기, docs/fonts.md), 미등록 ID는 기본 폰트.
  - 편집/사용 모드 플래그를 컨텍스트로 준비(지금은 사용 모드). 픽스처 2~3개와 순수 함수 단위 테스트.

- [ ] **M3 에디터**
  - 편집/사용 모드 분리(사용 모드에서는 어떤 것도 움직이지 않음).
  - 그리드: 블록 추가(빈 자리 자동 탐색), 드래그 스냅 + 충돌 시 드롭 불가 후 원위치(밀어내기 없음), S/M/L 변경(허용 크기만), 삭제/복제.
  - 자유 레이어: 추가(파일 선택, 드래그앤드롭, 내장 스티커), 이동/리사이즈/회전/z-order/레이어 전환/잠금/삭제/복제, 캔버스 밖으로 완전히 나가는 이동 금지.
  - 스타일 인스펙터(색, 폰트, 모서리, 테두리, 그림자 프리셋, 투명도, image 옵션). 색 입력은 HexColor만.
  - undo/redo(드래그는 한 동작으로 묶음, 히스토리 제한), 디바운스 자동 저장, 저장 직전 ThemeSchema 검증과 실패 표시, 키보드 단축키(macOS 관례), 최소 접근성.
  - 상태 로직(reducer/store)은 UI와 분리해 단위 테스트. 상태 관리 방식은 선택지를 비교해 추천.

- [ ] **M4 기능 블록**
  - 투두: 목록 여러 개, 추가/수정/삭제/완료/드래그 정렬, dueDate, props.listId(null이면 기본), showCompleted, completedAt.
  - 캘린더: 월/주 보기, weekStartsOn, 시각/종일 일정 CRUD, 타임존/DST 테스트, 마감일 있는 투두를 읽기 전용으로 표시. 날짜 라이브러리는 번들 크기와 함께 비교해 선택. 반복 일정 없음.
  - 타이머: idle → running → paused 상태 머신, endsAt 기반 순수 계산, pausedRemainingMs, 절전 복귀(powerMonitor resume)와 앱 재시작 복원(종료 시각이 지났으면 즉시 완료), 완료 알림(권한 거부 시 앱 내 표시), 프리셋, display(digital/ring), 상태 변경을 main 이벤트 버스로 발행(focus + running = 집중 모드).
  - 블록 UI는 S/M/L마다 레이아웃이 다르다. 사용자 데이터는 테마와 독립. 시간 로직은 fake timers 테스트.

- [ ] **M0 펫 프로토타입(스파이크)** — 코드 품질이 아니라 "되는가"를 검증. 수동 확인이 끝나기 전에는 체크하지 않는다.
  - spikes/pet-proto/ 에 독립 Electron 프로젝트. 키 내용/키 코드는 읽지도 로깅하지도 않는다.
  - 검증: (1) 투명+frameless+항상 위 창에 PNG 표시, 작은 창 setBounds 이동과 FPS/프레임 간격 로그 (2) 클릭 통과 + 펫 위에서만 드래그 (3) 풀스크린/다른 Space/다중 모니터 표시와 Dock 부작용 (4) 타이핑 감지 후보 비교: powerMonitor.getSystemIdleTime(기준선) → CoreGraphics 호출(koffi) → Swift CLI 헬퍼, 전역 훅은 최후 수단 (5) on/off 시 창/폴링/자식 프로세스 완전 종료 (6) app.getAppMetrics()로 idle/걷기 CPU와 메모리 기록 (7) 이동 방식 A(작은 창 이동)와 C(하단 얇은 오버레이)를 스위치로 비교.
  - 산출물: docs/spikes/pet-results.md(항목 / 방법 / 자동 결과 / 수동 확인 필요 / 판정 / 비고), 수동 체크리스트, 이동 방식과 감지 방식 추천.

- [ ] **M5 펫 통합** — M0 결론을 따른다. 모호하면 구현 전에 질문.
  - PlatformAdapter(getKeyboardIdleSeconds, getMusicState 스텁, 오버레이 창 헬퍼). macOS만 구현.
  - PetManager(창 생성/파괴, petEnabled와 현재 테마 pet 구독, 테마 전환 시 교체), PetStateMachine(typing > music > rest, 임계값/히스테리시스, 순수 로직 + 테스트), 펫이 켜져 있을 때만 폴링하고 유휴 시 간격을 늘림.
  - 상태별 이미지(없으면 rest), 절차적 애니메이션, 내장 기본 펫(자체 제작 플레이스홀더 3장), 클릭 통과 + 펫 위에서만 상호작용.
  - 펫 설정 UI(이름, 크기, walk/speed, 상태별 PNG 업로드, 알파 없는 PNG 경고, 미리보기).
  - 메뉴바(Tray): 보드 열기, 펫 켜기/끄기, 종료. 보드 창을 닫아도 앱은 종료되지 않음. 창 간 이벤트 버스(타이머 시작/종료에 펫이 간단히 반응, 투두 완료는 발행만).
  - docs/privacy.md: 수집하는 정보는 "마지막 키 입력 이후 경과 시간"뿐.

- [ ] **M6 다중 테마와 자동 전환**
  - 테마 목록/새로 만들기/복제/이름 변경/삭제/활성 전환, 첫 실행 템플릿 2~3개(자체 제작 에셋만).
  - ThemeResolver(순수 함수): 입력(시각, 타임존, 규칙, focus 여부, 시스템 외형, manualOverride) → 출력(themeId, 다음 재평가 시각). 모든 조건 충족 시 매치, 여러 개면 priority, 동점이면 생성이 늦은 규칙. 자정 넘김 구간의 요일 기준(구간 시작일)을 문서화. 경계 시각/DST/우선순위/오버라이드 만료 테스트.
  - ThemeScheduler(main): 앱 시작, 다음 재평가 시각 단발 타이머, resume, 시간/타임존 변경, nativeTheme updated, 타이머 모드 변경, 규칙/설정 변경에서 재평가. setInterval 단독 폴링 금지. 전환은 크로스페이드(reduced-motion 존중).
  - 규칙 편집 UI, 자동 전환 on/off, 수동 전환 시 "다음 규칙 경계까지 / 해제할 때까지" 선택.

- [ ] **M7 내보내기/가져오기**
  - 내보내기: theme.json + assets/ + manifest(앱 버전, schemaVersion)를 zip으로. 저장 전 미리보기(에셋 목록, 펫 포함 여부, 초상/저작물 확인 체크). 고아 에셋 제외, 사용자 데이터/절대 경로 미포함.
  - 가져오기(전부 main, 임시 폴더에서 처리 후 성공 시에만 원자적 이동): 크기/확장자 확인 → 해제 제한(엔트리 수, 총 용량, 압축비, 중첩 zip 금지) → 경로 검증(zip-slip, 절대 경로, 심볼릭 링크) → theme.json 검증(미래 schemaVersion 거부, 과거는 마이그레이션) → 에셋 재인코딩/해시 치환 → 정규화(ID 재발급, listId null, 폰트 대체, 이름 충돌 처리) → 사용자 확인.
  - 악성 입력 픽스처 테스트(zip-slip, zip bomb, 심볼릭 링크, 거대 JSON, 미지의 키, 원시 CSS, SVG, 확장자 위조, 해시 불일치, 중복 ID, 미래 schemaVersion)와 왕복 테스트. docs/security-import.md에 공격-방어 대응표.

- [ ] **M8 패키징/서명/공증**
  - electron-builder 우선 검토(electron-forge와 비교), DMG, arm64/x64(universal 여부 추천). 네이티브 모듈과 Swift 헬퍼의 asar unpack과 서명 확인.
  - Hardened Runtime + 최소 entitlements(각 이유 주석). 서명/공증 비밀 값은 환경변수나 키체인으로 주입, 저장소에 넣지 않는다.
  - MVP는 수동 업데이트. 표시 이름(꾸미꾸미)/내부 식별자(kkumikkumi)/번들 ID/아이콘은 상수로 분리. 사용자 데이터가 없는 로컬 에러 로그와 로그 폴더 열기.
  - docs/release.md: 서명/공증 절차, 검증(codesign, spctl, stapler), 클린 계정 최초 실행 권한 확인, 업그레이드 시 DB 마이그레이션 확인.
