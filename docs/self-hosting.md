# 개인 서버 동기화 (프로토콜 v1)

꾸미꾸미를 macOS와 Windows에서 쓰면서 같은 계정의 **할 일, 카테고리, 스프린트, 메모**를 동기화한다.
일정·시간표·습관·일기·사진·테마·실행 중 타이머·창 위치·MCP 권한은 이번 버전의 동기화 대상이 아니다.
동기화는 선택 사항이며 기본은 꺼져 있다. 서버에 연결하지 않아도 기존 로컬 기능을 계속 쓸 수 있다.

## 소스와 배포 관리

- `apps/desktop`: 앱과 동기화 클라이언트. 접속키는 Electron `safeStorage`로 암호화해 보관하며 UI로 다시 반환하지 않는다.
- `apps/sync-server`: Node 24 HTTP 서버, SQLite 저장소, 계정 관리 CLI. Docker 이미지는 amd64/arm64 호스트에서 빌드할 수 있다.
- `packages/schema/src/sync.ts`: 앱/서버가 함께 사용하는 버전 있는 API 계약, 유효성 검사, 변경 비교와 병합.
- `deploy/sync`: Docker Compose와 선택적인 HTTPS 프록시 예시.

앱과 서버 변경을 같은 저장소의 PR로 검토한다. 서버에서는 검토된 **커밋 SHA**를 체크아웃해 이미지를 빌드하고 태그에도 SHA를 기록한다.
운영 서버에서 직접 소스를 고치지 않는다. 접속키·SSH 키·실제 데이터·백업은 커밋하지 않는다.
새 의존성 `esbuild`는 서버를 Node 내장 모듈 외 런타임 설치 없이 실행할 수 있는 파일로 번들하기 위해 사용한다(이미 프로젝트에서 쓰는 버전).

## 처음 설치

Docker Engine과 Compose v2가 설치된 VPS/NAS에서, 본인 포크 또는 원본의 검토된 커밋을 사용한다.

```sh
git clone <repository-url> kkumikkumi
cd kkumikkumi
git checkout <reviewed-commit-sha>
cd deploy/sync
export KKUMI_TAG=$(git rev-parse --short HEAD)
docker compose up -d --build --wait
docker compose exec sync node dist/admin.js create-account my-devices
```

마지막 명령은 `accountId`와 **접속키 token을 한 번 출력**한다. 비밀번호 관리자에 보관하고, 같은 사용자의 기기들에 이 키를 넣는다.
다른 사람은 별도 계정을 발급한다. 일반 사용자에게 SSH나 Docker 권한을 줄 필요는 없다.
서버 DB에는 원본 키 대신 SHA-256 해시만 저장한다. 공개 회원가입은 없다.

기본 Compose는 **서버의 127.0.0.1:8787에서만** 연결을 받는다. 영구 데이터는 `kkumikkumi-sync_sync-data` Docker 볼륨의 `/data/sync.db`에 있다.
이미지를 다시 빌드하거나 컨테이너를 교체해도 이 볼륨은 유지된다. `docker compose down -v`는 데이터를 지우므로 사용하지 않는다.

## 도메인이 없을 때: SSH 터널

각 클라이언트 PC에서 다음을 실행하고 터미널을 열어 둔다(Windows는 OpenSSH 클라이언트 필요).

```sh
ssh -N -o ExitOnForwardFailure=yes -o ServerAliveInterval=30 -o ServerAliveCountMax=3 -L 127.0.0.1:8787:127.0.0.1:8787 -i <private-key-path> ubuntu@<server-ip>
```

꾸미꾸미 **설정 → 기기 간 동기화**에서:

1. 서버 주소 `http://127.0.0.1:8787`
2. 발급받은 접속키
3. 기존 데이터를 이 계정으로 올리는 확인란을 확인하고 연결

이 방식은 SSH 포트 **TCP 22**만 필요하다. 기존 SSH 접근 범위를 유지하고, 8787을 외부에 열지 않는다.
터널이 끊겨도 로컬 편집은 저장된다. 터널을 다시 열면 약 10초 안에 동기화를 재시도한다.

## 도메인이 있을 때: HTTPS

도메인의 A/AAAA 레코드를 서버로 연결하고, 호스트에 설치한 Caddy 설정에 `deploy/sync/Caddyfile.example`의 도메인을 바꿔 적용한다.
Caddy는 `127.0.0.1:8787`로 프록시한다. OCI를 쓴다면 보안 목록/NSG와 OS 방화벽에서 **TCP 80·443**을 허용한다.
앱에는 `https://sync.example.com`과 접속키를 넣는다. 인증서를 검증하지 않는 옵션은 제공하지 않는다.
HTTP는 루프백 주소에만 허용한다. DB나 앱 포트를 공개할 필요는 없다.

## 업데이트·키 교체·백업

```sh
# repo 루트에서 새 커밋을 받아 검토한 SHA로 이동한 뒤
git fetch origin
git checkout <new-reviewed-commit-sha>
cd deploy/sync
export KKUMI_TAG=$(git rev-parse --short HEAD)
docker compose up -d --build --wait
docker compose logs --tail 30 sync

# 키를 잃어버렸을 때: 이전 키는 즉시 무효화된다. 각 기기에 새 키를 넣는다.
docker compose exec sync node dist/admin.js rotate-key <account-id>

# 실행 중인 WAL DB를 안전하게 백업한다. .db 파일만 직접 복사하지 않는다.
docker compose exec sync node dist/admin.js backup /data/backup.db
docker compose cp sync:/data/backup.db ./backup.db
```

백업에는 모든 계정의 실제 데이터와 인증 정보가 있으므로 접근을 제한한 저장소에 보관한다.
복구는 서버를 중지한 상태에서 볼륨의 `sync.db`를 백업으로 교체하고, 이전 `sync.db-wal`/`sync.db-shm`을 따로 격리한 뒤 시작한다.
서버가 이전 revision으로 돌아가면 앱은 자동 덮어쓰기를 멈춘다. 복구 데이터를 확인하고 연결 해제→재연결을 통해 기존 로컬 데이터 가져오기를 명시적으로 선택한다.
이전 이미지로 돌아갈 때도 해당 버전의 데이터 형식과 맞는 백업을 함께 확인한다.

앱의 `sync-backups/*.json`에서 선택한 내용을 복구하려면, 먼저 서버 DB를 위 명령으로 백업한다.
그다음 JSON 파일을 `docker compose cp <snapshot.json> sync:/data/restore.json`으로 옮기고
`docker compose exec sync node dist/admin.js restore-account <account-id> /data/restore.json`을 실행한다.
해당 계정의 동기화 대상 네 묶음만 교체하며 revision은 증가한다. 앱은 다음 동기화 때 변경을 받으며 남아 있는 로컬 수정과 충돌하면 선택을 요구한다.

## 동기화와 충돌 동작

- 로컬 SQLite에 편집을 즉시 저장하고, 마지막으로 확인한 서버 스냅샷과 비교해 변경·삭제만 전송한다. 별도 메모리 큐에만 의존하지 않아 앱을 다시 시작해도 미전송 변경을 복구한다.
- `GET /v1/snapshot`은 계정별 현재 스냅샷을 가져오고, `POST /v1/changes`는 `revision`·`mutationId`·행 변경 묶음을 원자적으로 적용한다. 재시도는 중복 적용하지 않는다.
- 서버 스냅샷과 로컬 기준점은 서버/계정 ID에 묶인다. 서버가 바뀌면 자동 업로드를 중지한다. 다른 서버/계정으로의 데이터 이동은 연결 확인란을 통한 명시적인 가져오기다.
- 초기 연결과 충돌 해결 전에는 앱 데이터 폴더의 `sync-backups`에 JSON 백업을 남긴다. 연결을 해제해도 로컬 데이터는 남는다.
- 서로 다른 항목의 수정은 자동 병합한다. 같은 항목의 서로 다른 수정이나 삭제/수정 충돌은 화면에서 선택한다. 기기 시계로 승자를 정하지 않는다.
- 카테고리 삭제와 다른 기기의 하위 항목 수정처럼 참조가 충돌하면 전체 묶음 선택이 필요하다. UI에 이를 표시하며 양쪽 스냅샷을 보관한다.
- 원격 변경 반영 전 렌더러의 편집 저장을 기다리고, 네트워크 요청 중 발생한 로컬 편집은 보존해 다음 요청에 보낸다. 입력칸에 포커스가 있으면 자동으로 포커스를 빼앗지 않고 동기화를 미룬다. 입력을 마친 뒤 다음 주기에 재시도한다. 저장에 실패한 메모 입력은 재시도할 수 있도록 남긴다.
- v1은 한 계정 문서와 요청을 각각 8 MiB로 제한한다. 읽기는 전체 스냅샷, 쓰기는 행 변경 묶음이며 10초 주기로 확인한다. 이미지 동기화나 대규모 공동 편집을 위한 프로토콜은 아니다.

## 검증과 운영 범위

PR의 CI는 macOS/Windows에서 타입 검사·테스트·Electron 테스트·패키징을 실행하고, Windows 설치 파일을 artifact로 올린다.
서버 이미지는 Linux에서 빌드/기동 확인한다. 설치 파일은 개발자 인증서 없이 생성하므로 Windows SmartScreen의 게시자 확인 경고가 나올 수 있다.
실제 Windows에서 창 크기·한글 입력·알림·설치/제거·MCP 연결을 확인하는 절차는 [windows.md](windows.md)에 있다.

참고: [Node IPC](https://nodejs.org/api/net.html#ipc-support), [Electron 패키징](https://www.electron.build/v26/docs/features/multi-platform-build/), [Caddy HTTPS](https://caddyserver.com/docs/quick-starts/https), [SQLite backup](https://nodejs.org/api/sqlite.html#sqlitebackupsourceDb-destination-options).
