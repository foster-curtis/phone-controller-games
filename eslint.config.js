import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const phaser = {
  regex: '^phaser(/|$)',
  message: 'Phaser is render-only: keep it out of this module.',
};
const netClient = {
  regex: '^@pcg/net-client(/|$)',
  message: 'sim/match are plain TS: no networking imports (M6 wires them).',
};

export default defineConfig(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '.claude/worktrees/**',
      'playwright-report/**',
      'test-results/**',
      'apps/sunny-side/e2e/__screens__/**',
      'apps/sunny-side/public/**',
      'apps/sunny-side/brand/**',
    ],
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  // Boundary rules (frozen at F0).
  {
    files: ['apps/sunny-side/src/host/sim/**', 'apps/sunny-side/src/host/match/**'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [phaser, netClient] }],
    },
  },
  {
    files: ['apps/sunny-side/src/controller/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            phaser,
            {
              regex: '(^|/)host(/|$)',
              message: 'The controller must not import host code (phones never load it).',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['packages/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '(^|/)apps(/|$)|^@pcg/(relay|sunny-side)(/|$)',
              message: 'packages/** must not depend on apps/**.',
            },
          ],
        },
      ],
    },
  },
);
