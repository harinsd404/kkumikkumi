# Windows 지원

Windows x64 설치 파일은 Windows에서 빌드한다. `sharp`의 Windows 네이티브 바이너리를 포함하도록 빌드 호스트별로 의존성을 설치한다.
macOS에서 설치한 `node_modules`를 Windows로 복사하지 않는다.

```powershell
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm test:electron
pnpm --filter @kkumikkumi/desktop dist:win
```

설치 파일은 `apps/desktop/dist/kkumikkumi-<version>-x64-setup.exe`에 생성된다.
Windows에서는 OS 기본 제목 표시줄(최소화·최대화·닫기)을 유지하고, 보드와 미니 타이머는 기존 UI를 사용한다.
사용자 데이터는 `%APPDATA%/kkumikkumi`에 저장된다. 서버 데이터와 다른 PC의 창 위치·MCP 권한은 별개다.

## MCP

설정 → AI 연결에서 모드를 선택하면 설치된 실행 파일을 가리키는 설정이 표시된다.
`kkumikkumi.exe --mcp-stdio`는 앱을 새로 열거나 DB를 직접 읽지 않고, 실행 중인 앱의 사용자별 Named Pipe에 stdio를 중계한다.
Node나 `nc`를 별도로 설치할 필요가 없다. 소켓을 켤 때 발급한 비밀값으로 중계를 인증하며, AI 설정에는 비밀값을 넣지 않는다.
macOS의 기존 Unix 소켓 설정은 계속 사용할 수 있다.

## 수동 확인

- 새 설치, 업데이트, 제거 후 사용자 데이터 유지 여부
- 창 최소화·최대화·복원·닫기, 보드 비율, 다중 모니터와 125/150% 배율
- 한글 조합 중 입력, Ctrl+C/V/Z, 메모 자동 저장 및 창 닫기 전 저장
- PNG/JPEG/WebP 가져오기와 배경 이미지 표시(패키지 안의 Windows sharp 확인)
- 미니 타이머와 완료 알림
- MCP 읽기·쓰기 설정, stdio 중계, 잘못된 연결의 거부
- 맥과 같은 개인 서버에 연결 → 오프라인 편집 → 재접속 → 삭제/수정 충돌 선택

ARM64 Windows 전용 설치 파일은 배포 대상에 포함하지 않는다. 0.4.0부터 릴리스에 x64 설치 파일을 함께 올린다([release.md](release.md)).
