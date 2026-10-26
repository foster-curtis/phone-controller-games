import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
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

// Package names of everything under apps/ (games and the relay), read from their package.json so a
// new game is covered without editing this file.
const appsDir = join(import.meta.dirname, 'apps');
const appPackages = readdirSync(appsDir)
  .map((dir) => join(appsDir, dir, 'package.json'))
  .filter((file) => existsSync(file))
  .map((file) => JSON.parse(readFileSync(file, 'utf8')).name)
  .map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

export default defineConfig(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '.claude/worktrees/**',
      'playwright-report/**',
      'test-results/**',
      'apps/*/e2e/__screens__/**',
      'apps/*/public/**',
      'apps/*/brand/**',
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
  // Boundary rules (frozen at F0), applied to every game that follows the apps/<game> layout.
  {
    files: ['apps/*/src/host/sim/**', 'apps/*/src/host/match/**'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [phaser, netClient] }],
    },
  },
  {
    files: ['apps/*/src/controller/**'],
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
              regex: `(^|/)apps(/|$)|^(${appPackages.join('|')})(/|$)`,
              message: 'packages/** must not depend on apps/**.',
            },
          ],
        },
      ],
    },
  },
);
