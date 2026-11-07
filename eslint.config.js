import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig(
  {
    ignores: [
      '.output/',
      '.wxt/',
      'dist/',
      'coverage/',
      'site/',
      'node_modules/',
      'prototype/sync-simulation.mjs',
      'prototype/sync-e2e/',
    ],
  },
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // 這類專案的 race condition 常來自沒被處理的 Promise。
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
    },
  },
  {
    // WXT 的 entrypoint 可以是空殼。
    files: ['src/entrypoints/**'],
    rules: { '@typescript-eslint/no-empty-function': 'off' },
  },
  {
    // YouTube 的 DOM 變動很頻繁，產品程式碼不能自行做大範圍監聽或輪詢。
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "NewExpression[callee.name='MutationObserver']",
          message: '請改用 src/lib/dom/observers.ts 提供的窄範圍監聽。',
        },
      ],
      'no-restricted-globals': [
        'error',
        {
          name: 'setInterval',
          message: '不要輪詢，請改用事件或對準下一句時間的 setTimeout。',
        },
        {
          name: 'requestAnimationFrame',
          message: '字幕不需要每幀更新，請改用 timeupdate 和定時器。',
        },
      ],
    },
  },
  {
    files: ['src/lib/dom/observers.ts'],
    rules: { 'no-restricted-syntax': 'off' },
  },
  {
    // 設定檔不在 tsconfig 內，不做型別檢查。
    files: ['**/*.js'],
    extends: [tseslint.configs.disableTypeChecked],
  },
  {
    // 開發用擴充功能是純 JS，直接在瀏覽器執行。
    files: ['tools/recorder-extension/**', '.claude/skills/**'],
    rules: { 'no-undef': 'off' },
  },
  {
    // Node scripts are plain JavaScript, outside the TypeScript project.
    files: ['scripts/**/*.mjs'],
    extends: [tseslint.configs.disableTypeChecked],
    rules: { 'no-undef': 'off' },
  },
  prettier,
);
