# 의존성 기록

추가한 의존성마다 이유와 대안을 한 줄로 적는다.

| 패키지                                                                           | 위치                | 이유                                                                   | 대안                                           |
| -------------------------------------------------------------------------------- | ------------------- | ---------------------------------------------------------------------- | ---------------------------------------------- |
| electron 44.7.0                                                                  | desktop (dev)       | 앱 런타임(확정 스택)                                                   | -                                              |
| electron-vite 5.0.0                                                              | desktop (dev)       | main/preload/renderer 통합 빌드와 dev 서버                             | electron-forge + vite 플러그인, 6.0 베타       |
| vite 7.3.7                                                                       | desktop (dev)       | electron-vite 5의 peer 범위(≤7)                                        | vite 8(electron-vite 6 필요)                   |
| @vitejs/plugin-react 5.2.0                                                       | desktop (dev)       | React JSX/Fast Refresh, vite 7 지원                                    | 6.x(vite 8 전용)                               |
| react, react-dom 19.3.0                                                          | desktop             | UI(확정 스택)                                                          | -                                              |
| @types/react, @types/react-dom 19.x, @types/node 24.x                            | desktop (dev)       | 타입. node는 Electron 44 내장 Node 24에 맞춤                           | -                                              |
| typescript 6.0.3                                                                 | 루트 (dev)          | typescript-eslint peer가 <6.1                                          | TS 7(typescript-eslint 지원 시 상향)           |
| vitest 5.0.3                                                                     | 루트 (dev)          | 단위 테스트, vite 설정 공유                                            | jest                                           |
| eslint 10, typescript-eslint 8, @eslint/js, globals, eslint-plugin-react-hooks 7 | 루트 (dev)          | 최소 린트 + 렌더러/스키마의 electron import 금지 규칙                  | biome                                          |
| prettier 3.9.9                                                                   | 루트 (dev)          | 포맷                                                                   | biome                                          |
| zod 4.6.5                                                                        | schema              | 스키마 단일 출처(CLAUDE.md), 시드가 zod 4 문법                         | valibot(시드 재작성 필요)                      |
| sharp 0.35.5                                                                     | desktop             | 에셋 디코딩/축소/재인코딩, WebP 디코딩, 픽셀 상한, 알파 판별           | nativeImage(WebP 불가), renderer canvas 디코딩 |
| zod 4.6.5                                                                        | desktop             | main IPC 입력 재검증(스키마 패키지와 같은 버전)                        | -                                              |
| (추가 안 함) better-sqlite3                                                      | -                   | node:sqlite로 대체: Electron 44 prebuild 없음, 네이티브 빌드/서명 부담 | 필요 시 Db 래퍼 뒤에서 교체                    |
| pretendard 1.3.9                                                                 | desktop (dev, 번들) | 기본 폰트(시안). 공식 woff2를 수정 없이 사용                           | -                                              |
| galmuri 2.40.3                                                                   | desktop (dev, 번들) | 갈무리11 폰트                                                          | -                                              |
