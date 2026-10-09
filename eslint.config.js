import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['**/node_modules/**', '**/out/**', '**/dist/**', 'spikes/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['apps/desktop/src/main/**', 'apps/desktop/src/preload/**', '**/*.config.{ts,js}'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['apps/desktop/src/renderer/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // 보드 렌더러는 electron을 import하지 않는다(CLAUDE.md 아키텍처 원칙).
      'no-restricted-imports': ['error', { paths: ['electron'] }],
    },
  },
  {
    files: ['packages/schema/**'],
    rules: { 'no-restricted-imports': ['error', { paths: ['electron', 'react'] }] },
  },
)
