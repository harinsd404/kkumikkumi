# 프로젝트: 꾸미꾸미 (kkumikkumi) — 데스크탑 꾸미기 앱

## 개요

macOS 우선(Windows는 추후 검토)의 데스크탑 앱. 사용자가 일반 창 안의 "보드"를 위젯 블록으로 꾸민다.
기능: 투두, 캘린더(내부 일정), 타이머, 데스크탑 펫, 다중 테마와 자동 전환, 테마 파일 내보내기/가져오기.
스케치: 보드 안에 캘린더(좌, 큼), 이미지(우상), 투두(우하).

## 이름

- 표시 이름: 꾸미꾸미. 내부 식별자(패키지 스코프 @kkumikkumi/\*, 폴더, 실행 파일명): kkumikkumi.
- 번들 ID의 도메인 부분은 미정(1차 배포는 임시 app.kkumikkumi.desktop). 이름/번들 ID는 src/shared/identity.ts 한 곳, electron-builder.yml과 일치를 테스트로 확인.
- macOS 앱 파일 이름은 영문(kkumikkumi.app — 한글 productName이면 electron-builder의 NFD 파일 이름 때문에 시작 직후 멈춤), 보이는 이름은 CFBundleDisplayName/InfoPlist.strings로 "꾸미꾸미". 아이콘은 사용자 제공 로고(build/logo-source.png → scripts/make-icon.mjs → build/icon.png).
- 상표/스토어/도메인 충돌은 아직 확인하지 않았다(사용자가 확인 예정). 기본 펫(마스코트) 이름 "꾸이"는 제안일 뿐 미확정.

## 확정 결정사항

- 스택: Electron + React + TypeScript(strict), Vite 기반, pnpm 모노레포.
- 보드는 일반 창이다(바탕화면 레벨 아님). 펫은 별도 창이다.
- 레이아웃
  - 그리드 블록: 크기는 S/M/L(+ image 전용 W 배너), 퍼즐처럼 배치. 타입은 calendar, todo, timer, image, memo, timetable, dday. 셀 수는 타입별 크기표(packages/schema BLOCK_SIZES, 2026-10-12 시안 기준).
  - 디자인 시안: Figma 파일 mJL2BsO51Ir9l9z4wK1lDI (3:1079 푸딩 아침, 6:2384 코튼캔디). 시안 1280x800(+타이틀바 36) = 논리 캔버스 1600x1000의 0.8배. 블록 바깥 여백/간격 25(논리 px)는 렌더러에서만 적용.
  - 기본 테마(2026-10-14 사용자 지시): 푸딩 아침, 코튼캔디는 앱 내장 테마로 항상 있다(고정 ID, 없으면 시작 시 생성). 이름 바꾸기/삭제 불가, 색·글꼴·배치는 수정 가능하고 "처음 상태로 되돌리기" 제공. 새 테마는 프리셋 복사가 아니라 "새로 만들기" 창(이름, 색, 무늬, 글꼴, 배치 템플릿)으로 만든다.
  - 테마 색은 defaults.palette(text, subText, accent, check, surface, control), 배경은 색 + 내장 무늬(stars/dots). 블록 style의 null 값은 팔레트로 대체.
  - 자유 배치 레이어: 스티커와 이미지. 위치/크기/회전/z-order, back/front 레이어.
  - 이미지 블록: 그리드 image 블록과 자유 image 아이템이 같은 ImageContent 구조를 공유.
- 리사이즈: 고정 논리 캔버스(1600x1000, 8x5 그리드)를 균일 스케일로 그리고 창 비율을 잠근다. 반응형 재배치 없음.
- 데이터: 로컬 전용(계정/서버/동기화 없음). 모든 엔티티에 UUID, schemaVersion, updatedAt. outbox/tombstone/deviceId는 만들지 않는다.
- 저장: 사용자 데이터는 SQLite(node:sqlite, 2026-10-12 결정 — better-sqlite3는 Electron 44 prebuild 없음), 테마는 폴더(theme.json + assets/<hash>.<ext>).
- 에셋: sharp로 재인코딩. 저장 포맷은 PNG/JPEG로 정규화(WebP는 투명이면 PNG, 아니면 JPEG), 펫은 PNG만. 긴 변 상한 image 3200px / pet 512px.
- 캘린더: 내부 일정만. 시각 일정은 startUtc/endUtc + tzid, 종일 일정은 날짜 문자열. 반복 일정은 MVP 제외(recurrence: null 예약).
- 타이머: setInterval 카운트다운 금지. endsAt 타임스탬프로 남은 시간 계산. 절전 복귀/앱 재시작 후 복원.
- 폰트: 번들 폰트 목록에서만 선택. 테마에는 fontId만 저장, 없는 ID는 기본 폰트로 대체. 번들 조건(2026-10-12 수정): OFL 계열, 또는 "소프트웨어 번들/폰트 파일 재배포"를 라이선스 원문에서 명시적으로 허용하는 무료 라이선스. 재배포 금지·불명확(요약표 "비해당" 등)이면 저작권자 서면 허락 전까지 넣지 않는다. 파일 수정 금지 또는 예약 글꼴 이름(RFN)이 있으면 공식 배포 파일을 변환/서브셋 없이 그대로 쓴다. 파일은 공식 배포처(또는 저작권자가 관리하는 npm 패키지)에서만 받는다. 라이선스 확인 결과는 docs/fonts.md에 기록.
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
- 크기표(2026-10-12 시안 반영): 8x5 그리드(1칸 200px). calendar M=2x2/L=4x3, todo S=2x2/M=2x3/L=4x3, timer S=2x1/M=2x2, image S=2x1/M=2x2/L=4x3/W=8x1, memo S=2x2/M=2x3/L=4x3, timetable S=2x2/M=2x3/L=4x3, dday S=2x1/M=2x2. 단일 출처는 packages/schema의 BLOCK_SIZES.
- 창: 앱이 그리는 타이틀바 36px(titleBarStyle hiddenInset) + 보드 16:10. setAspectRatio(16/10, { height: 36 }).
- 이미지 블록/스티커 업로드는 PNG/JPG/WebP 허용, 펫 이미지는 PNG만.
- 펫 이동 방식(작은 창 이동 vs 하단 오버레이)은 M0 스파이크 결과로 결정.

## 아키텍처 원칙

- main: 파일, DB, 창, OS 연동, 가져오기 검증. renderer: UI만. 둘 사이는 타입 있는 IPC(preload는 최소 API만 노출). main은 renderer 입력을 zod로 재검증한다.
- 보드 렌더러는 electron을 import하지 않는 순수 React로 작성(추후 웹 미리보기 재사용 가능).
- 스키마(zod)는 packages/schema가 단일 출처. 저장, 가져오기, IPC 경계에서 반드시 검증.
- 시간/규칙/충돌 판정 로직은 순수 함수로 분리하고 단위 테스트를 작성.

## 보안/프라이버시 규칙

- contextIsolation: true, nodeIntegration: false, sandbox: true, 엄격한 CSP, 외부 URL 탐색/새 창 차단.
- 가져오기 파일은 신뢰할 수 없는 입력: zip-slip, 엔트리 수/용량/압축비 제한, 확장자 허용 목록, 스키마 검증, 이미지 디코딩 후 재인코딩 + 해시 재계산, 모든 ID 재발급, todo.listId, memo.memoId, timetable.timetableId, dday.eventId는 null로 치환, 원시 CSS/HTML 금지, SVG 금지. 전부 성공했을 때만 원자적으로 저장.
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

- [x] **M2 보드 렌더러(읽기 전용)**
  - 순수 React. 논리 캔버스를 transform: scale로 균일 스케일. setAspectRatio로 창 비율 잠금(extraSize 고려), 최소 창 크기, 창 크기/위치 저장·복원.
  - 렌더 순서: 배경 → back 자유 아이템 → 그리드 블록 → front 자유 아이템(레이어 내 z 순서).
  - StyleSchema/DecorSchema → CSS 변환 함수(shadow 프리셋 매핑 등). 원시 CSS 문자열 경로 금지.
  - calendar/todo/timer는 크기별 플레이스홀더. image 블록은 fit/focus/zoom/shape 반영. 스티커 레지스트리(builtin + asset).
  - 번들 폰트 레지스트리(fontId → woff2, 라이선스 표기, docs/fonts.md), 미등록 ID는 기본 폰트.
  - 편집/사용 모드 플래그를 컨텍스트로 준비(지금은 사용 모드). 픽스처 2~3개와 순수 함수 단위 테스트.

- [x] **M3 에디터**
  - 편집/사용 모드 분리(사용 모드에서는 어떤 것도 움직이지 않음).
  - 그리드: 블록 추가(빈 자리 자동 탐색), 드래그 스냅 + 충돌 시 드롭 불가 후 원위치(밀어내기 없음), S/M/L 변경(허용 크기만, 2026-10-12 수정: 겹치는 블록은 가장 가까운 빈자리로 밀고 밀 곳이 없으면 거부, 끝에서 커지면 안쪽으로 당김), 삭제/복제.
  - 자유 레이어: 추가(파일 선택, 드래그앤드롭, 내장 스티커), 이동/리사이즈/회전/z-order/레이어 전환/잠금/삭제/복제, 캔버스 밖으로 완전히 나가는 이동 금지.
  - 스타일 인스펙터(색, 폰트, 모서리, 테두리, 그림자 프리셋, 투명도, image 옵션). 색 입력은 HexColor만.
  - undo/redo(드래그는 한 동작으로 묶음, 히스토리 제한), 디바운스 자동 저장, 저장 직전 ThemeSchema 검증과 실패 표시, 키보드 단축키(macOS 관례), 최소 접근성.
  - 상태 로직(reducer/store)은 UI와 분리해 단위 테스트. 상태 관리 방식은 선택지를 비교해 추천.

- [x] **M4 기능 블록**
  - 투두: 목록 여러 개, 추가/수정/삭제/완료/드래그 정렬, dueDate, props.listId(null이면 기본), showCompleted, completedAt.
  - 캘린더: 월/주 보기, weekStartsOn, 시각/종일 일정 CRUD, 타임존/DST 테스트, 마감일 있는 투두를 읽기 전용으로 표시. 날짜 라이브러리는 번들 크기와 함께 비교해 선택. 반복 일정 없음.
  - 타이머: idle → running → paused 상태 머신, endsAt 기반 순수 계산, pausedRemainingMs, 절전 복귀(powerMonitor resume)와 앱 재시작 복원(종료 시각이 지났으면 즉시 완료), 완료 알림(권한 거부 시 앱 내 표시), 프리셋, display(digital/ring), 상태 변경을 main 이벤트 버스로 발행(focus + running = 집중 모드).
  - 블록 UI는 S/M/L마다 레이아웃이 다르다. 사용자 데이터는 테마와 독립. 시간 로직은 fake timers 테스트.

- [x] **기능별 세부 페이지 (2026-10-12 사용자 지시)**
  - 보드 창 안 전체 화면으로 전환(타이틀바 탭, 사용 모드에서 블록 빈 곳 클릭). 테마 팔레트/폰트 사용.
  - 할 일: 목록 관리, 오늘/예정/전체/완료 필터, 검색, 메모(todo_items.note, 마이그레이션 002).
  - 캘린더: 월/주/일 보기, 끌어서 옮기기(월=날짜, 시간 칸=15분 단위, 벽시계 시각/길이 유지), 고른 날 목록.
  - 뽀모도로는 타이머 안의 모드(사용자 결정). 사이클 설정은 사용자 설정, 늦게 끝난 단계는 자동 시작하지 않음. 타이머 기록(timer_sessions, 마이그레이션 003)과 통계.
  - 미니 타이머 창(별도 frameless 창, 항상 위 토글, 위치 기억). 기존 타이머 블록은 유지.

- [x] **메모장 (2026-10-13 사용자 지시)**
  - 사용자 데이터(memos 테이블, 마이그레이션 004). 본문 원문만 저장(최대 2만 자), 제목은 첫 줄. 테마/내보내기에 포함하지 않는다.
  - 간단한 서식(# ##, - * 목록, 1. 번호, - [ ] 체크, **굵게**, ~~취소선~~)을 직접 해석해 React 요소로만 그린다. HTML/링크/이미지 문법 없음.
  - 1단계: 서식 해석, IPC(memos.list/create/update/delete), 메모 페이지(목록/검색/고정/삭제, 편집·보기, 서식 버튼, 0.5초 자동 저장 + 닫을 때 저장).
  - 2단계: memo 블록(S 2x2/M 2x3/L 4x3, props.memoId, null이면 안내), 블록 메뉴, 인스펙터에서 메모 고르기/새로 만들기, 블록에서 체크 토글, 빈 곳 클릭으로 그 메모 열기.

- [x] **시간표 (2026-10-14 사용자 지시)**
  - 시간표 하나. 교시 방식(요일×교시 칸, 교시 시각 설정)과 시간 방식(요일별 자유 시각 항목) 둘 다, 페이지에서 전환. 두 방식의 항목은 따로 저장.
  - 사용자 데이터(timetable_entries, 마이그레이션 005 + settings 'timetable'). 월~금 기본, 토/일은 설정. 교시를 줄이면 뒤 교시 칸은 확인 후 삭제.
  - 자동 색은 과목을 처음 입력한 순서대로(방식마다 따로), 칸마다 직접 색 지정 가능.
  - 1단계: 데이터/IPC, 시간표 페이지(교시 표: 칸 편집 + Enter로 다음 칸, 교시 시각 편집 / 시간 표: 두 번 눌러 추가, 겹침 나란히, 지금 표시).
  - 2단계: timetable 블록(S 2x2/M 2x3 오늘, L 4x3 주간), 블록 메뉴, 빈 곳 클릭으로 페이지.

- [x] **시간표 여러 개 + 테마 톤 색 (2026-10-14 사용자 지시)**
  - 시간표 여러 개(최대 20, timetables 테이블, 마이그레이션 006). 방식·주말·교시 시각은 시간표마다 따로. 기존 데이터는 "내 시간표"로 옮김. 전역 설정 'timetablePrefs'(고른 시간표, 없으면 첫 시간표).
  - 칸 색은 테마 강조·체크 색의 톤(번호 0~11)만 고를 수 있다. 번호로 저장해 테마가 바뀌면 색도 따라간다(기존 직접 색은 자동으로).
  - 1단계: 데이터/IPC(timetables.create/update/delete/select), 페이지(제목 자리 시간표 고르기, 목록: 고르기/이름 바꾸기/복제/삭제/새로 만들기), 톤 색 고르기, 주말 표시를 체크 상자로 분리.
  - 2단계: 블록 props.timetableId(null = 고른 시간표 따라가기, 기존 {}는 null로 읽음, 가져올 때 null로 치환), 위젯에서 고른 시간표 바꾸기(전역, 테마는 안 바뀜), 인스펙터에서 따라가기/특정 시간표 고정.

- [x] **테마 고르기 + 공용 색 팔레트 + UI 정리 (2026-10-14 사용자 지시)** — M6 일부(테마 고르기/만들기)를 앞당긴다. 이름 바꾸기·삭제·자동 전환은 M6.
  - 시안 6:2384 테마 이름은 "코튼캔디"(프리첼 아님). 테마 프리셋: 푸딩 아침, 코튼캔디. 시안의 배너 사진은 넣지 않는다(자체 제작 에셋만).
  - 색 고르기는 어디서나 같은 팔레트: 이 테마 대표색(팔레트) + 강조·체크 색 톤, 그리고 다른 테마(저장된 테마 + 아직 안 만든 프리셋)의 대표색을 바로 고를 수 있다. 시간표 칸 색은 테마를 따라가야 하므로 지금처럼 이 테마 톤만.
  - 1단계: 타이틀바 테마 메뉴(테마 목록 고르기, 프리셋으로 새 테마 만들기), 공용 색 팔레트(인스펙터, 일정 창), 타이틀바·인스펙터·편집 화면 색을 테마 팔레트 CSS 변수로, 흰 카드 위에서 안 보이는 control 색 보정.
  - 2단계: 투두 블록 시안 맞춤(목록 제목 색·완료 체크 색을 두 색 번갈아, 안 한 체크는 회색 채움), 구역 제목/버튼 3종/탭 통일, 시간표 블록 목록 위아래 흐림, 체크 상자 통일, 실행 취소 아이콘.

- [x] **위젯 갤러리 + 가리지 않는 편집 화면 (2026-10-14 사용자 지시)**
  - 애플 위젯 편집처럼: 편집 모드 오른쪽 패널(위젯 추가 / 설정 탭)에 종류·크기별 실제 미리보기(지금 테마·데이터). 누르면 빈 자리에 추가, 보드로 끌어 놓으면 그 칸에 추가(격자 스냅, 겹치면 거부).
  - 편집 중 패널이 보드를 가리지 않는다: 창 안을 "보드 | 패널"로 나누고 보드는 남은 칸에 맞춰 줄어든다. 창 크기/위치는 바꾸지 않는다.
  - 타이틀바 "+ 블록" 메뉴는 없애고 "+ 꾸미기"(사진·스티커)는 갤러리로 옮긴다.

- [x] **스티커 흰 배경 지우기 (2026-10-14 사용자 지시)**
  - 방법 1(외부 모델 없음): 가장자리와 이어진 흰색에 가까운 픽셀만 투명하게, 경계는 부드럽게(흰 테 보정), 지운 뒤 남은 그림 크기로 여백을 잘라 투명 PNG로 저장. 계산은 main(sharp raw 픽셀 + 순수 함수).
  - 스티커를 넣을 때만, 투명도가 없고 가장자리가 거의 흰색이면 미리보기 창(원본 / 배경 지움, 지우는 정도 슬라이더)으로 물어본다. 사진 넣기·끌어 놓기는 묻지 않는다.

- [x] **기본 테마 + 새 테마 만들기 + 테마 관리 (2026-10-14 사용자 지시)** — M6의 목록/새로 만들기/복제/이름 변경/삭제를 앞당긴다. 자동 전환은 M6.
  - main: 기본 테마 고정 ID(BUILTIN_THEME_IDS)와 시작 시 보장(손상된 것은 건드리지 않음), 기본 테마 이름 바꾸기·삭제 거부(builtin_theme), themes.create(이름, 팔레트, 배경 색/무늬, 글꼴, 템플릿 — zod 재검증), themes.resetBuiltin. 기존 사용자의 테마는 "내 테마"로 그대로 둔다.
  - 배치 템플릿(순수 함수, 8x5 안 겹침 테스트): 기본(배너·캘린더·할 일), 사진 + 캘린더, 공부(배너·시간표·할 일·타이머), 빈 보드.
  - 화면: 타이틀바 테마 메뉴(기본 테마 / 내 테마, 새 테마 만들기, 테마 관리), 새 테마/색·글꼴 수정 창(색 가져오기, 공용 팔레트, 무늬, 글꼴, 템플릿, 실제 보드 미리보기), 테마 관리 창(색·글꼴, 복제, 이름, 삭제 확인, 기본 테마 되돌리기 확인). 지금 테마를 고치면 다시 불러와 바로 반영.

- [x] **디데이 위젯 (2026-10-15 사용자 지시)**
  - dday 블록(S 2x1 한 줄, M 2x2 크게 + 다음 일정 2개). props.eventId: null = 가장 가까운 다가오는 일정(자동), UUID = 고정(지난 뒤에도 시작일 기준 D+N). 가져올 때 null로 치환.
  - 표기: 시작 전 D-N, 시작일~마지막 날 D-DAY(여러 날이면 진행 중), 끝나면 D+N. 날짜는 로컬 날짜 문자열 달력 산술(순수 함수 + 테스트).
  - IPC calendar.get(없으면 null), calendar.upcoming(끝나지 않은 일정, 종류마다 시작 순 limit ≤ 50). 위젯 갤러리(데이터 없으면 예시 일정), 인스펙터 일정 고르기, 누르면 캘린더 페이지.

- [x] **전체 점검 + 리팩토링 (2026-10-15 사용자 지시)** — 1차 배포(펫 제외) 전 정리.
  - R1 버그 수정: 패키지된 앱에서 ELECTRON_RENDERER_URL 무시(IPC 노출 방지), 앱 URL 비교 NFC 정규화, IPC/close-ready 발신자 검사 통일, 테마별 쓰기 순서(정리·이름·되돌리기와 저장 경합), save로 기본 테마 이름 변경 거부, 투두 완료 이벤트는 저장 뒤·없는 목록은 not_found, 공용 대화창 틀(맨 위 창만 Esc, 열려 있으면 편집 단축키 막기), 한글 조합 중 Enter 무시, 닫을 때 blur 저장·진행 중 IPC 대기·자동 저장 dispose 시 저장, 인스펙터 선택 바뀌면 입력 상태 초기화, 숫자 칸 입력 중 보정 안 함, 지운 타이머 프리셋, 디데이 고르기 자정 갱신, 여러 날 일정 둘째 날 끌기, 시간표 칸 지우기 실패 시 머무름, 끌기 중 사라질 때 리스너 정리.
  - R2 구조 정리(동작 그대로): main IPC 핸들러 영역별 분리 + 입력 스키마 모음, main/index 창·타이머·보안 분리, settings 키값 헬퍼, 타입 단일 출처(ThemeSummary·AssetPurpose·TimerCommand 일치 검사), 저장 에셋 형식 PNG/JPEG로 축소(WebP 입력은 그대로 디코딩), BoardScreen·Inspector·CalendarPage·TimetablePage 분리, 공용 날짜 헬퍼·확인 버튼·이름 바꾸기 칸·체크 상자, CSS 덮어쓰기 정리와 --ui-danger, 번들되는 의존성을 devDependencies로.

- [x] **테마 색 직접 만들기 + 기본 색 조합 (2026-10-15 사용자 지시)**
  - 기본 색 조합(테마 아님, 새 테마 창 "색 조합"과 모든 색 견본에 나온다): 초코나무숲(#D2E8C4, #AC967F), 오늘의 토마토(#F1A597, #D2E8C4), 딸기케이크(#EAB8C1, #CE4E41, #C79364, #F2DEDD). 지정 원색은 그대로 쓰고, 빈 칸은 같은 계열 톤으로 채운다. 접근성용 미세 조정만 허용(글자 대비 7:1, 보조 글자 4.5:1 — 명도만 낮춤), 큰 수정 금지.
  - 대표색으로 만들기(강조·체크 필수, 배경·버튼·무늬 선택, 나머지 자동, 순수 함수 + 테스트), 자유 색 고르기(채도·밝기 사각형 + 색상 띠, 키보드 조작).
  - 내 색 조합: 사용자 데이터(settings 'colorCombos', 최대 30개, 테마/내보내기에 포함하지 않음), IPC colorCombos.list/add/delete(zod 재검증).

- [x] **1차 배포: 펫 제외, 나와 지인용 (2026-10-15 사용자 지시)** — M8 일부. 서명/공증 없이 ad-hoc 서명한 Apple Silicon DMG.
  - electron-builder(DMG arm64, asarUnpack sharp, 퓨즈: runAsNode/NODE_OPTIONS/inspect 끔·asar 무결성·asar에서만 로드), 영문 파일 이름 + 한글 표시 이름, 사용자 로고 아이콘, 버전 0.1.0, `pnpm dist`.
  - 배포본 보안: ELECTRON_RENDERER_URL 무시, --remote-debugging-port면 종료(시험 빌드만 허용), 개발 메뉴(다시 불러오기/개발자 도구)는 개발 중에만.
  - 오류 기록(로그 폴더/main.log, 태그와 오류 종류만), 메뉴 "도움말 → 오류 기록 폴더 열기". 시험 빌드(KKUMI_SMOKE_DATA_DIR)로 실제 데이터 없이 배포본 확인. docs/release.md.
  - 남은 M8: 개발자 ID 서명·공증, universal/x64, 업데이트 방식, 클린 계정 확인.

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
  - (테마 목록/새로 만들기/복제/이름 변경/삭제/활성 전환, 기본 테마와 배치 템플릿은 2026-10-14에 앞당겨 완료)
  - ThemeResolver(순수 함수): 입력(시각, 타임존, 규칙, focus 여부, 시스템 외형, manualOverride) → 출력(themeId, 다음 재평가 시각). 모든 조건 충족 시 매치, 여러 개면 priority, 동점이면 생성이 늦은 규칙. 자정 넘김 구간의 요일 기준(구간 시작일)을 문서화. 경계 시각/DST/우선순위/오버라이드 만료 테스트.
  - ThemeScheduler(main): 앱 시작, 다음 재평가 시각 단발 타이머, resume, 시간/타임존 변경, nativeTheme updated, 타이머 모드 변경, 규칙/설정 변경에서 재평가. setInterval 단독 폴링 금지. 전환은 크로스페이드(reduced-motion 존중).
  - 규칙 편집 UI, 자동 전환 on/off, 수동 전환 시 "다음 규칙 경계까지 / 해제할 때까지" 선택.

- [ ] **M7 내보내기/가져오기**
  - 내보내기: theme.json + assets/ + manifest(앱 버전, schemaVersion)를 zip으로. 저장 전 미리보기(에셋 목록, 펫 포함 여부, 초상/저작물 확인 체크). 고아 에셋 제외, 사용자 데이터/절대 경로 미포함.
  - 가져오기(전부 main, 임시 폴더에서 처리 후 성공 시에만 원자적 이동): 크기/확장자 확인 → 해제 제한(엔트리 수, 총 용량, 압축비, 중첩 zip 금지) → 경로 검증(zip-slip, 절대 경로, 심볼릭 링크) → theme.json 검증(미래 schemaVersion 거부, 과거는 마이그레이션) → 에셋 재인코딩/해시 치환 → 정규화(ID 재발급, listId/memoId/timetableId/eventId null, 폰트 대체, 이름 충돌 처리) → 사용자 확인.
  - 악성 입력 픽스처 테스트(zip-slip, zip bomb, 심볼릭 링크, 거대 JSON, 미지의 키, 원시 CSS, SVG, 확장자 위조, 해시 불일치, 중복 ID, 미래 schemaVersion)와 왕복 테스트. docs/security-import.md에 공격-방어 대응표.

- [ ] **M8 패키징/서명/공증**
  - electron-builder 우선 검토(electron-forge와 비교), DMG, arm64/x64(universal 여부 추천). 네이티브 모듈과 Swift 헬퍼의 asar unpack과 서명 확인.
  - Hardened Runtime + 최소 entitlements(각 이유 주석). 서명/공증 비밀 값은 환경변수나 키체인으로 주입, 저장소에 넣지 않는다.
  - MVP는 수동 업데이트. 표시 이름(꾸미꾸미)/내부 식별자(kkumikkumi)/번들 ID/아이콘은 상수로 분리. 사용자 데이터가 없는 로컬 에러 로그와 로그 폴더 열기.
  - docs/release.md: 서명/공증 절차, 검증(codesign, spctl, stapler), 클린 계정 최초 실행 권한 확인, 업그레이드 시 DB 마이그레이션 확인.
