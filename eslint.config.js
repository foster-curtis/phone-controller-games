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

const noNet = {
  ...netClient,
  message: 'Plain TS: no networking imports; src/host/net wires it (SPEC §15.1).',
};
const themes = {
  regex: '(^|/)themes(/|$)',
  message:
    'Theme packs are presentation only: the sim and the systems never see them (SPEC §15.1).',
};
const content = {
  regex: '(^|/)content(/|$)',
  message:
    'Extraction-ready code takes game data as parameters, never from src/content (SPEC §15.1).',
};
const simFolder = {
  regex: '(^|/)sim(/|$)',
  message: 'Extraction-ready code must not import the game sim (SPEC §15.1).',
};

// DOM globals (browser globals Node doesn't also have, plus browser storage and I/O Node now has
// too): the sim, systems and party run headless.
const domGlobals = [
  ...Object.keys(globals.browser).filter(
    (name) => !(name in globals.node) && !(name in globals.builtin),
  ),
  ...['localStorage', 'sessionStorage', 'Storage', 'navigator', 'fetch', 'WebSocket'],
].map((name) => ({ name, message: 'No DOM here: plain TS that runs headless (SPEC §15.1).' }));

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
      'apps/*/generated/**',
      'apps/gallery/src/brand/**',
      // Lint fixtures break the boundary rules on purpose; `eslint --no-ignore <file>` checks them.
      'apps/*/src/**/__fixtures__/**',
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
  // Fort Frenzy layout (SPEC §15.1): the deterministic sim and the extraction-ready systems/party.
  // A later block replaces an earlier one's options for the same rule, so each lists every pattern.
  {
    files: ['apps/*/src/host/sim/**', 'apps/*/src/host/systems/**', 'apps/*/src/host/party/**'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [phaser, noNet, themes] }],
      'no-restricted-globals': ['error', ...domGlobals],
    },
  },
  {
    files: ['apps/*/src/host/sim/**', 'apps/*/src/host/systems/**'],
    rules: {
      'no-restricted-properties': [
        'error',
        ...[
          ['Math', 'random'],
          ['Date', 'now'],
          ['performance', 'now'],
        ].map(([object, property]) => ({
          object,
          property,
          message: 'Determinism: use the seeded RNG streams and step counts (SPEC §15.3).',
        })),
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "NewExpression[callee.name='Date'], CallExpression[callee.name='Date']",
          message: 'Determinism: no wall clock in the sim (SPEC §15.3).',
        },
      ],
    },
  },
  {
    files: ['apps/*/src/host/systems/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            phaser,
            noNet,
            themes,
            content,
            simFolder,
            {
              regex: `^(\\.\\./){2,}|^(${appPackages.join('|')})(/|$)`,
              message:
                'systems/<name> imports only @pcg/game-kit and sibling systems (SPEC §15.1).',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['apps/*/src/host/party/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            phaser,
            noNet,
            themes,
            content,
            simFolder,
            {
              regex: `^\\.\\./|^(${appPackages.join('|')})(/|$)`,
              message: 'party/ imports only packages and its own files (SPEC §15.1).',
            },
          ],
        },
      ],
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
  {
    // The one exception (PLATFORM decision #9): the catalog's list imports each game's game.meta.ts,
    // and nothing else from apps/.
    files: ['packages/catalog/src/games.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: `(^|/)apps/(?![^/]+/game\\.meta\\.ts$)|^(${appPackages.join('|')})(/|$)`,
              message: 'The catalog imports only apps/<game>/game.meta.ts from apps/.',
            },
          ],
        },
      ],
    },
  },
  {
    // The helpers' `test` records which files each test loads; e2e selection needs every spec on it.
    files: ['apps/*/e2e/**/*.spec.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@playwright/test',
              importNames: ['test'],
              message: "Import `test` from './helpers' (it records the files each test loads).",
            },
          ],
        },
      ],
    },
  },
);
