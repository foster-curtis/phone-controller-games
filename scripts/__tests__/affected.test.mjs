import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { selectUnit } from '../lib/unit.mjs';
import { computeAffected, depsClosure } from '../lib/workspace.mjs';

// The real graph's shape: net-client dev-depends on relay; games depend on the kits and the relay.
const pkg = (name, dir, deps, scripts = { test: 'vitest run' }) => ({
  name,
  dir,
  deps,
  scripts,
  e2e: null,
  hasPlay: dir.startsWith('apps/') && name !== '@pcg/relay',
});
const ws = [
  pkg('@pcg/relay', 'apps/relay', []),
  pkg('@pcg/net-client', 'packages/net-client', ['@pcg/relay']),
  pkg('@pcg/game-kit', 'packages/game-kit', []),
  pkg('@pcg/controller-kit', 'packages/controller-kit', ['@pcg/net-client']),
  pkg('@pcg/sunny-side', 'apps/sunny-side', [
    '@pcg/controller-kit',
    '@pcg/game-kit',
    '@pcg/net-client',
    '@pcg/relay',
  ]),
  pkg('@pcg/say-cheese', 'apps/say-cheese', [
    '@pcg/controller-kit',
    '@pcg/game-kit',
    '@pcg/net-client',
    '@pcg/relay',
  ]),
];
const affected = (files) => [...computeAffected(files, ws).affected.keys()].sort();

describe('computeAffected', () => {
  it('a game-only change affects only that game', () => {
    assert.deepEqual(affected(['apps/say-cheese/src/host/view/lobby.ts']), ['@pcg/say-cheese']);
  });

  it('a game-kit change reaches every game', () => {
    assert.deepEqual(affected(['packages/game-kit/src/rng.ts']), [
      '@pcg/game-kit',
      '@pcg/say-cheese',
      '@pcg/sunny-side',
    ]);
  });

  it('a relay change reaches everything that depends on it', () => {
    assert.deepEqual(affected(['apps/relay/src/rooms.ts']), [
      '@pcg/controller-kit',
      '@pcg/net-client',
      '@pcg/relay',
      '@pcg/say-cheese',
      '@pcg/sunny-side',
    ]);
  });

  it('shared config outside any package affects everything', () => {
    for (const file of [
      'pnpm-lock.yaml',
      'eslint.config.js',
      'scripts/e2e.mjs',
      '.github/workflows/ci.yml',
      'some-new-file.txt',
    ]) {
      const result = computeAffected([file], ws);
      assert.equal(result.all, true, file);
      assert.equal(result.affected.size, ws.length, file);
    }
  });

  it('root docs and changesets affect nothing (format check only)', () => {
    const result = computeAffected(['README.md', 'PLATFORM.md', '.changeset/x.md'], ws);
    assert.equal(result.all, false);
    assert.equal(result.affected.size, 0);
    assert.deepEqual(result.rootDocs, ['README.md', 'PLATFORM.md', '.changeset/x.md']);
  });

  it('depsClosure walks dependencies transitively', () => {
    assert.deepEqual([...depsClosure('@pcg/controller-kit', ws)].sort(), [
      '@pcg/controller-kit',
      '@pcg/net-client',
      '@pcg/relay',
    ]);
  });
});

describe('selectUnit', () => {
  const game = ws.find((p) => p.name === '@pcg/say-cheese');
  const exists = () => true;

  it('traces code changes with vitest related, plus the tests that read from disk', () => {
    const pick = selectUnit({
      pkg: game,
      files: ['apps/say-cheese/src/host/view/lobby.ts', 'packages/game-kit/src/rng.ts'],
      workspace: ws,
      diskTests: ['apps/say-cheese/src/shared/__tests__/icons.test.ts'],
      exists,
    });
    assert.deepEqual(pick, {
      kind: 'related',
      files: [
        'apps/say-cheese/src/host/view/lobby.ts',
        'apps/say-cheese/src/shared/__tests__/icons.test.ts',
        'packages/game-kit/src/rng.ts',
      ],
    });
  });

  it('runs the whole suite for files imports cannot explain', () => {
    for (const file of [
      'apps/say-cheese/src/styles/tv.css',
      'apps/say-cheese/package.json',
      'apps/say-cheese/vitest.config.ts',
      'packages/game-kit/package.json',
    ]) {
      assert.equal(
        selectUnit({ pkg: game, files: [file], workspace: ws, exists }).kind,
        'full',
        file,
      );
    }
  });

  it('skips docs, e2e, other packages’ tests and unrelated packages', () => {
    const files = [
      'apps/say-cheese/SPEC.md',
      'apps/say-cheese/e2e/smoke.spec.ts',
      'apps/say-cheese/playwright.config.ts',
      'packages/game-kit/test/rng.test.ts',
      'apps/sunny-side/src/host/game.ts',
    ];
    assert.deepEqual(selectUnit({ pkg: game, files, workspace: ws, exists }), { kind: 'skip' });
  });

  it('runs the whole suite when every relevant file was deleted', () => {
    const pick = selectUnit({
      pkg: game,
      files: ['apps/say-cheese/src/gone.ts'],
      workspace: ws,
      exists: () => false,
    });
    assert.equal(pick.kind, 'full');
  });
});
