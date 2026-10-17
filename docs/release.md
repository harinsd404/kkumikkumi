# 배포 (1차: 나와 지인용, 서명/공증 없음)

## 만들기

```sh
pnpm install
pnpm typecheck && pnpm lint && pnpm test && pnpm test:electron
pnpm dist          # apps/desktop/dist/kkumikkumi-<버전>-arm64.dmg
```

- 버전은 `apps/desktop/package.json`의 `version`. 올린 뒤 `pnpm dist`.
- 버전을 올리면 `CHANGELOG.md`에 바뀐 점을 적고 README의 "최신 버전" 줄을 맞춘다.
- 설정은 `apps/desktop/electron-builder.yml`. Apple Silicon(arm64) DMG만 만든다.
- ad-hoc 서명(`identity: "-"`)만 하고 공증은 하지 않는다. 개발자 ID 인증서가 생기면 identity/hardenedRuntime/notarize를 다시 정한다.
- 앱 안의 파일 이름은 영문(`kkumikkumi.app`)이고, 보이는 이름은 "꾸미꾸미"다(이유는 electron-builder.yml 주석과 verified-facts.md).
- 아이콘: 로고 원본 `apps/desktop/build/logo-source.png`를 바꾸면 `node apps/desktop/scripts/make-icon.mjs`로 `build/icon.png`를 다시 만든다(둥근 사각형 바깥 투명, 본체 824px).

## 배포 전 확인(실제 사용자 데이터를 건드리지 않는다)

배포본은 `~/Library/Application Support/kkumikkumi`(실제 데이터)를 쓴다. 시험은 데이터 폴더 이름만 다른 시험 빌드로 한다.

```sh
cd apps/desktop
KKUMI_SMOKE_DATA_DIR=kkumikkumi-smoke pnpm dist   # ~/Library/Application Support/kkumikkumi-smoke 사용
# 시험 데이터를 그 폴더에 넣고 dist/mac-arm64/kkumikkumi.app 실행 → 확인 후 폴더 삭제
# 시험이 끝나면 꼭 시험 설정 없이 다시 pnpm dist (시험 빌드를 배포하지 않는다)
```

확인 항목: 앱이 뜨는지(한글이 들어간 폴더에서도), 테마/할 일/일정이 보이는지, 이미지 넣기·흰 배경 지우기(sharp), 글꼴, 종료 후 오류 기록이 없는지.
시험 빌드만 `--remote-debugging-port`로 열 수 있다(배포본은 이 인자가 있으면 바로 종료).

```sh
codesign --verify --deep --strict dist/mac-arm64/kkumikkumi.app   # 서명 확인
shasum -a 256 dist/*.dmg                                          # 받는 사람에게 같이 알려 준다
```

## 받는 사람: 설치와 첫 실행

1. DMG를 열고 `꾸미꾸미`를 Applications로 끌어 놓는다.
2. 처음 열면 "확인되지 않은 개발자" 경고로 열리지 않는다(공증하지 않았기 때문).
   - 시스템 설정 → 개인정보 보호 및 보안 → 아래쪽 "확인 없이 열기"(Open Anyway) → 암호 입력 → 열기.
   - 또는 터미널: `xattr -dr com.apple.quarantine /Applications/kkumikkumi.app` (믿을 수 있는 사람에게 받은 파일일 때만)
3. 데이터는 이 Mac 안에만 저장된다: `~/Library/Application Support/kkumikkumi`. 오류 기록은 메뉴 "도움말 → 오류 기록 폴더 열기"(사용자 데이터는 들어 있지 않다).

## 업데이트

자동 업데이트 없음. 새 DMG로 앱을 덮어쓰면 데이터는 그대로 남는다(DB 마이그레이션은 앱이 시작할 때 실행). 이전 버전으로 되돌리면 새 DB를 열지 못할 수 있다(future_db_version 안내).
