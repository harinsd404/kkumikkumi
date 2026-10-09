# 확인된 사실

공식 문서, npm 레지스트리, 설치된 패키지, 실측으로 확인한 내용만 적는다. 형식: 항목 / 결론 / 출처 / 버전 / 확인일.

## 환경

| 항목                    | 결론                                                                         | 출처                                                       | 버전   | 확인일     |
| ----------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------- | ------ | ---------- |
| 개발 Mac의 macOS        | 26.5.1 (빌드 25F80). 타 AI가 말한 "macOS 27 Golden Gate"는 이 환경과 다르다  | `sw_vers` 실측                                             | -      | 2026-10-10 |
| 로컬 Node / pnpm        | Node v25.8.1(비 LTS), pnpm 11.7.0                                            | `node -v`, `pnpm -v` 실측                                  | -      | 2026-10-10 |
| Electron 최신 안정판    | 44.7.0 (npm `latest` 태그, 2026-10-07 배포). "Electron 44"는 사실. 45는 beta | `npm view electron dist-tags`                              | 44.7.0 | 2026-10-10 |
| Electron 44 내장 런타임 | Node 24.21.0, Chromium 152.0.7977.130. 그래서 @types/node는 24.x 사용        | `ELECTRON_RUN_AS_NODE=1 electron -p process.versions` 실측 | 44.7.0 | 2026-10-10 |

## 도구 버전 호환 (U8 일부)

| 항목                             | 결론                                                                                                                                                                                                         | 출처                                                                     | 버전   | 확인일     |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ | ------ | ---------- |
| electron-vite 유지보수           | 안정판 5.0.0(2025-12-07). 6.0.0-beta.7이 2026-10-07에 배포되어 개발은 계속되고 있다                                                                                                                          | `npm view electron-vite time`, https://github.com/alex8088/electron-vite | 5.0.0  | 2026-10-10 |
| electron-vite 5와 Vite 8         | 호환 범위 밖. peer가 `vite ^5 \|\| ^6 \|\| ^7`이라 Vite 7.3.7 사용                                                                                                                                           | `npm view electron-vite@5.0.0 peerDependencies`                          | 5.0.0  | 2026-10-10 |
| @vitejs/plugin-react             | 6.x는 `vite ^8` 필요. 5.2.0은 `^4..^8` 지원이라 5.2.0 사용                                                                                                                                                   | `npm view @vitejs/plugin-react@… peerDependencies`                       | 5.2.0  | 2026-10-10 |
| TypeScript 7과 typescript-eslint | typescript-eslint 8.71.1의 peer가 `typescript >=4.8.4 <6.1.0`이라 TS 6.0.3 사용                                                                                                                              | `npm view typescript-eslint@8.71.1 peerDependencies`                     | 8.71.1 | 2026-10-10 |
| Vitest 5와 Vite 7                | peer `vite ^6.4 \|\| ^7 \|\| ^8`이므로 호환                                                                                                                                                                  | `npm view vitest@5.0.3 peerDependencies`                                 | 5.0.3  | 2026-10-10 |
| electron-vite 출력 형식          | 가장 가까운 package.json에 `"type": "module"`이 있으면 main/preload를 ESM(.mjs)으로, 없으면 CJS로 번들한다. apps/desktop은 type 미지정으로 둬서 CJS(`out/preload/index.js`가 `require("electron")`)로 만든다 | https://electron-vite.org/guide/dev , 빌드 결과 실측                     | 5.0.0  | 2026-10-10 |

## pnpm

| 항목                      | 결론                                                                                                                                                                                                                                                        | 출처                                  | 버전   | 확인일     |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- | ------ | ---------- |
| 의존성 빌드 스크립트 허용 | pnpm 11은 `onlyBuiltDependencies`를 제거하고 `allowBuilds` 맵(`pkg: true/false`)을 쓴다. 목록에 없으면 실행하지 않고, `strictDepBuilds` 기본값 true라 install이 실패한다. 실제로 esbuild에서 `ERR_PNPM_IGNORED_BUILDS`가 발생해 `esbuild: false`로 명시했다 | https://pnpm.io/settings/build , 실측 | 11.7.0 | 2026-10-10 |

## Electron 보안

| 항목                                       | 결론                                                                                                                                                                                                                                                | 출처                                                                                                          | 버전       | 확인일     |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ---------- | ---------- |
| 보안 기본값                                | contextIsolation 기본 true(12.0.0부터), nodeIntegration 기본 false(5.0.0부터), sandbox 기본 true(20부터), webviewTag 기본 false. 그래도 코드에 명시한다                                                                                             | https://www.electronjs.org/docs/latest/tutorial/security , `electron.d.ts` WebPreferences JSDoc               | 44.7.0     | 2026-10-10 |
| 탐색 / 새 창 차단                          | `web-contents-created`에서 `will-navigate` 처리 후 `preventDefault()`, `setWindowOpenHandler`는 `{ action: 'deny' }` 반환. URL 비교는 `startsWith`가 아니라 `new URL().origin`으로                                                                  | 위 보안 문서                                                                                                  | 44.7.0     | 2026-10-10 |
| `will-navigate`/`will-redirect`의 url 인자 | 두 번째 인자 `url`은 `@deprecated`. `details.url`(Event params)을 사용한다                                                                                                                                                                          | `electron.d.ts`                                                                                               | 44.7.0     | 2026-10-10 |
| sandbox preload와 ESM                      | "Sandboxed preload scripts are run as plain JavaScript without an ESM context." 따라서 sandbox: true면 preload는 CJS로 번들해야 한다. sandbox preload의 `require`는 `electron`(contextBridge, ipcRenderer 등), `events`, `timers`, `url`만 가능하다 | https://www.electronjs.org/docs/latest/tutorial/esm , https://www.electronjs.org/docs/latest/tutorial/sandbox | 44.7.0     | 2026-10-10 |
| CSP와 Vite dev                             | `script-src 'self'`로 dev 페이지 로드와 React 렌더 중 CSP 위반은 없었다. 단, dev 서버가 끊기면 Vite 클라이언트의 재연결 blob worker가 CSP에 막힌다(dev 전용이라 허용하지 않음)                                                                      | `ELECTRON_ENABLE_LOGGING=1` 실측                                                                              | vite 7.3.7 | 2026-10-10 |
