# 의존성 기록

추가한 의존성마다 이유와 대안을 한 줄로 적는다.

| 패키지                                                                           | 위치          | 이유                                                  | 대안                                     |
| -------------------------------------------------------------------------------- | ------------- | ----------------------------------------------------- | ---------------------------------------- |
| electron 44.7.0                                                                  | desktop (dev) | 앱 런타임(확정 스택)                                  | -                                        |
| electron-vite 5.0.0                                                              | desktop (dev) | main/preload/renderer 통합 빌드와 dev 서버            | electron-forge + vite 플러그인, 6.0 베타 |
| vite 7.3.7                                                                       | desktop (dev) | electron-vite 5의 peer 범위(≤7)                       | vite 8(electron-vite 6 필요)             |
| @vitejs/plugin-react 5.2.0                                                       | desktop (dev) | React JSX/Fast Refresh, vite 7 지원                   | 6.x(vite 8 전용)                         |
| react, react-dom 19.3.0                                                          | desktop       | UI(확정 스택)                                         | -                                        |
| @types/react, @types/react-dom 19.x, @types/node 24.x                            | desktop (dev) | 타입. node는 Electron 44 내장 Node 24에 맞춤          | -                                        |
| typescript 6.0.3                                                                 | 루트 (dev)    | typescript-eslint peer가 <6.1                         | TS 7(typescript-eslint 지원 시 상향)     |
| vitest 5.0.3                                                                     | 루트 (dev)    | 단위 테스트, vite 설정 공유                           | jest                                     |
| eslint 10, typescript-eslint 8, @eslint/js, globals, eslint-plugin-react-hooks 7 | 루트 (dev)    | 최소 린트 + 렌더러/스키마의 electron import 금지 규칙 | biome                                    |
| prettier 3.9.9                                                                   | 루트 (dev)    | 포맷                                                  | biome                                    |
| zod 4.6.5                                                                        | schema        | 스키마 단일 출처(CLAUDE.md), 시드가 zod 4 문법        | valibot(시드 재작성 필요)                |
