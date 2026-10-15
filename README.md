<p align="center">
  <img src="docs/images/icon.png" width="128" alt="꾸미꾸미 아이콘" />
</p>

<h1 align="center">꾸미꾸미</h1>

<p align="center">
  할 일, 캘린더, 타이머, 시간표를 한 화면에 모아 내 마음대로 꾸미는 macOS 데스크탑 보드 앱
</p>

<p align="center">
  <img src="docs/images/board.jpg" width="820" alt="꾸미꾸미 보드 화면" />
</p>

## 소개

꾸미꾸미는 창 하나에 위젯 블록을 퍼즐처럼 배치해 나만의 "보드"를 만드는 앱입니다.
캘린더, 할 일, 디데이, 사진, 스티커를 원하는 자리에 놓고 색과 글꼴과 무늬를 골라 테마로 저장합니다.

- **로컬 전용:** 계정, 서버, 동기화가 없습니다. 모든 데이터는 내 Mac 안에만 저장됩니다.
- **꾸미기 중심:** 8×5 격자에 블록을 놓고, 그 위에 사진과 스티커를 자유롭게 붙입니다.
- **테마:** 기본 테마 두 개(푸딩 아침, 코튼캔디)와 직접 만든 테마를 바꿔 가며 씁니다.

## 주요 기능

| 기능                | 설명                                                                                                         |
| ------------------- | ------------------------------------------------------------------------------------------------------------ |
| **보드 편집**       | 위젯 갤러리에서 끌어다 놓기, 크기 바꾸기(S/M/L), 격자 스냅, 실행 취소/다시 실행, 자동 저장                   |
| **사진·스티커**     | 자유 배치(이동·회전·크기·앞뒤 순서), 스티커의 흰 배경 지우기                                                 |
| **할 일**           | 목록 여러 개, 마감일, 오늘/예정/전체/완료 보기, 검색, 끌어서 순서 바꾸기                                     |
| **캘린더**          | 월/주/일 보기, 종일·시각 일정, 끌어서 날짜·시각 옮기기, 마감 있는 할 일 함께 보기                            |
| **디데이**          | 캘린더 일정으로 D-N / D-DAY / D+N 표시(가장 가까운 일정 자동 또는 특정 일정 고정)                            |
| **타이머·뽀모도로** | 집중/휴식, 뽀모도로 사이클, 기록과 통계, 항상 위에 띄우는 미니 타이머 창                                     |
| **메모**            | 간단한 서식(제목, 목록, 체크리스트, 굵게, 취소선), 블록에서 바로 체크                                        |
| **시간표**          | 교시 방식과 시간 방식, 시간표 여러 개, 테마 색을 따라가는 칸 색                                              |
| **테마 만들기**     | 색·무늬·글꼴·배치 템플릿 선택, 실시간 미리보기, 자유 색 고르기, 대표색으로 팔레트 자동 생성, 내 색 조합 저장 |

<table>
  <tr>
    <td><img src="docs/images/edit.jpg" alt="편집 모드와 위젯 패널" /></td>
    <td><img src="docs/images/theme-dialog.jpg" alt="새 테마 만들기" /></td>
  </tr>
  <tr>
    <td align="center">편집 모드: 보드를 가리지 않는 위젯·설정 패널</td>
    <td align="center">새 테마 만들기: 색 조합, 자유 색 고르기, 미리보기</td>
  </tr>
  <tr>
    <td><img src="docs/images/calendar.jpg" alt="캘린더 화면" /></td>
    <td><img src="docs/images/timetable.jpg" alt="시간표 화면" /></td>
  </tr>
  <tr>
    <td align="center">캘린더</td>
    <td align="center">시간표</td>
  </tr>
</table>

## 설치

Apple Silicon Mac(M1 이상)용 DMG를 제공합니다. 아직 Apple 공증을 받지 않아 처음 열 때 한 번 허용이 필요합니다.

1. `kkumikkumi-<버전>-arm64.dmg`를 열고 **꾸미꾸미**를 Applications로 끌어 놓습니다.
2. 처음 열 때 경고가 뜨면 **시스템 설정 → 개인정보 보호 및 보안 → 확인 없이 열기**를 누릅니다.

자세한 설치·삭제 방법과 배포 절차는 [docs/release.md](docs/release.md)를 참고하세요.

## 개발

### 요구 사항

- macOS (Apple Silicon 기준으로 개발·검증)
- Node.js 22.12 이상
- pnpm 11

### 명령

```sh
pnpm install
pnpm dev             # 개발 실행(main/IPC 코드를 바꾸면 다시 켜야 반영)
pnpm typecheck       # 타입 검사
pnpm lint            # ESLint + Prettier
pnpm test            # 단위 테스트(Vitest)
pnpm test:electron   # main 프로세스 테스트(SQLite·sharp, Electron의 Node로 실행)
pnpm build           # 빌드
pnpm dist            # macOS DMG 만들기(apps/desktop/dist)
```

### 기술 스택

| 영역   | 사용                                                           |
| ------ | -------------------------------------------------------------- |
| 앱     | Electron 44, React 19, TypeScript(strict), electron-vite       |
| 데이터 | `node:sqlite`(사용자 데이터), 테마는 폴더(`theme.json` + 에셋) |
| 검증   | zod 4 (스키마는 `packages/schema` 한 곳에서 정의)              |
| 이미지 | sharp (디코딩 → 축소 → PNG/JPEG 재인코딩 → 해시)               |
| 테스트 | Vitest                                                         |
| 패키징 | electron-builder (DMG, ad-hoc 서명, Electron 퓨즈)             |

의존성마다 추가한 이유와 대안은 [docs/dependencies.md](docs/dependencies.md)에 적어 둡니다.

### 구조

```
apps/desktop/
  src/main/        파일·DB·창·OS 연동, IPC 핸들러(입력은 zod로 재검증)
  src/preload/     renderer에 최소 API만 노출
  src/shared/      IPC 채널·타입, 앱 이름 상수
  src/renderer/
    board/         보드 렌더러(순수 React, electron을 import하지 않음)와 블록
    editor/        편집 상태(reducer·실행 취소·자동 저장), 인스펙터, 위젯 갤러리
    pages/         할 일·캘린더·타이머·메모·시간표 세부 화면
    app/           화면 조립, 테마 창, 대화창, 데이터 훅
  electron-builder.yml, build/, scripts/   패키징 설정과 아이콘
packages/schema/   테마·사용자 데이터 스키마, 기본값, 격자 판정 함수
docs/              확인된 사실, 의존성, 폰트 라이선스, 배포 문서
```

시간·격자·색 계산 같은 로직은 순수 함수로 분리하고 단위 테스트를 둡니다.

## 보안과 개인정보

- `contextIsolation`, `sandbox`, `nodeIntegration: false`, 엄격한 CSP를 사용하고, 외부 페이지 이동과 새 창은 막습니다.
- main 프로세스는 renderer에서 오는 모든 입력을 zod로 다시 검증합니다. 우리 앱 페이지(메인 프레임)에서 온 호출만 처리합니다.
- 배포본은 Node 실행 모드, `NODE_OPTIONS`, 디버거 인자를 끈 Electron 퓨즈를 쓰고, 원격 디버깅 포트로 실행하면 종료합니다.
- 오류 기록에는 오류 종류만 남기고 할 일, 일정, 파일 경로 같은 사용자 데이터는 남기지 않습니다.
- 데이터 위치: `~/Library/Application Support/kkumikkumi` (오류 기록: `~/Library/Logs/꾸미꾸미`)

## 로드맵

- [x] 보드·편집기, 할 일·캘린더·타이머·메모·시간표·디데이 블록
- [x] 테마 만들기·관리, 색 조합, 1차 배포(펫 제외)
- [ ] 데스크탑 펫(바탕화면 위를 돌아다니는 캐릭터, 타이핑·음악에 반응)
- [ ] 시간·요일·집중 모드·다크 모드에 따른 테마 자동 전환
- [ ] 테마 파일 내보내기/가져오기(zip)
- [ ] 개발자 ID 서명·공증, Intel Mac 지원

## 폰트

앱에 들어 있는 글꼴은 [Pretendard](https://github.com/orioncactus/pretendard)와 [갈무리11](https://github.com/quiple/galmuri)이며 둘 다 SIL Open Font License 1.1을 따릅니다.
라이선스 원문은 빌드 결과물에 함께 들어가고, 검토 내용은 [docs/fonts.md](docs/fonts.md)에 있습니다.
