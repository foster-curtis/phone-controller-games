import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mergeMap, parseReport, selectSpecs, urlToFile } from '../lib/impact.mjs';

const ROOT = process.platform === 'win32' ? 'C:\\repo' : '/repo';
const FS_ROOT = process.platform === 'win32' ? '/@fs/C:/repo' : '/@fs/repo';
const files = new Set([
  'apps/fort-frenzy/index.html',
  'apps/fort-frenzy/play.html',
  'apps/fort-frenzy/src/host/main.ts',
  'apps/fort-frenzy/src/styles/tv.css',
  'apps/fort-frenzy/public/icon-192.png',
  'packages/game-kit/src/loop.ts',
]);
const opts = {
  appDir: 'apps/fort-frenzy',
  webPort: 5175,
  root: ROOT,
  exists: (rel) => files.has(rel),
};

describe('urlToFile', () => {
  it('maps app modules, entries and public files', () => {
    assert.equal(
      urlToFile('http://localhost:5175/src/host/main.ts?t=123', opts),
      'apps/fort-frenzy/src/host/main.ts',
    );
    assert.equal(
      urlToFile('http://localhost:5175/src/styles/tv.css?direct', opts),
      'apps/fort-frenzy/src/styles/tv.css',
    );
    assert.equal(
      urlToFile('http://localhost:5175/?debug=1&stress=1', opts),
      'apps/fort-frenzy/index.html',
    );
    assert.equal(
      urlToFile('http://localhost:5175/play?code=ABCD', opts),
      'apps/fort-frenzy/play.html',
    );
    assert.equal(
      urlToFile('http://localhost:5175/icon-192.png', opts),
      'apps/fort-frenzy/public/icon-192.png',
    );
  });

  it('maps workspace packages served through /@fs/', () => {
    assert.equal(
      urlToFile(`http://localhost:5175${FS_ROOT}/packages/game-kit/src/loop.ts?v=1`, opts),
      'packages/game-kit/src/loop.ts',
    );
  });

  it('ignores other origins, Vite internals, pre-bundled deps and unknown files', () => {
    for (const url of [
      'http://localhost:8790/healthz',
      'https://fonts.googleapis.com/css2?family=X',
      'http://localhost:5175/@vite/client',
      'http://localhost:5175/node_modules/.vite/deps/phaser.js?v=1',
      `http://localhost:5175${FS_ROOT}/node_modules/.pnpm/x/index.js`,
      'http://localhost:5175/src/nope.ts',
      'ws://localhost:8790/',
    ]) {
      assert.equal(urlToFile(url, opts), null, url);
    }
  });
});

describe('selectSpecs', () => {
  const app = {
    name: '@pcg/fort-frenzy',
    dir: 'apps/fort-frenzy',
    deps: ['@pcg/game-kit'],
    scripts: {},
    e2e: null,
    hasPlay: true,
  };
  const ws = [
    app,
    {
      name: '@pcg/game-kit',
      dir: 'packages/game-kit',
      deps: [],
      scripts: {},
      e2e: null,
      hasPlay: false,
    },
  ];
  const map = {
    version: 1,
    specs: {
      'e2e/smoke.spec.ts': [
        'apps/fort-frenzy/index.html',
        'apps/fort-frenzy/src/host/main.ts',
        'packages/game-kit/src/loop.ts',
      ],
      'e2e/controller.spec.ts': [
        'apps/fort-frenzy/play.html',
        'apps/fort-frenzy/src/controller/main.ts',
      ],
    },
  };
  const specs = ['e2e/controller.spec.ts', 'e2e/smoke.spec.ts'];
  const pick = (changed, m = map, s = specs) =>
    selectSpecs({ app, files: changed, workspace: ws, map: m, specs: s });

  it('selects only the specs that loaded a changed file', () => {
    const r = pick(['apps/fort-frenzy/src/controller/main.ts']);
    assert.equal(r.full, false);
    assert.deepEqual([...r.specs.keys()], ['e2e/controller.spec.ts']);
    assert.deepEqual(
      [...pick(['packages/game-kit/src/loop.ts']).specs.keys()],
      ['e2e/smoke.spec.ts'],
    );
  });

  it('runs a changed spec, and nothing for docs and unit tests', () => {
    assert.deepEqual(
      [...pick(['apps/fort-frenzy/e2e/smoke.spec.ts']).specs.keys()],
      ['e2e/smoke.spec.ts'],
    );
    const none = pick([
      'apps/fort-frenzy/SPEC.md',
      'apps/fort-frenzy/src/host/__tests__/x.test.ts',
      'apps/sunny-side/src/a.ts',
    ]);
    assert.equal(none.full, false);
    assert.equal(none.specs.size, 0);
  });

  it('runs the whole suite for anything the map cannot vouch for', () => {
    assert.equal(pick(['apps/fort-frenzy/src/host/new-file.ts']).full, true);
    assert.equal(pick(['apps/fort-frenzy/e2e/helpers.ts']).full, true);
    assert.equal(pick(['apps/fort-frenzy/package.json']).full, true);
    assert.equal(pick(['apps/fort-frenzy/src/host/main.ts'], null).full, true);
  });

  it('adds specs the map has never recorded', () => {
    const r = pick(['apps/fort-frenzy/src/controller/main.ts'], map, [...specs, 'e2e/new.spec.ts']);
    assert.deepEqual([...r.specs.keys()].sort(), ['e2e/controller.spec.ts', 'e2e/new.spec.ts']);
  });
});

describe('mergeMap', () => {
  const old = {
    version: 1,
    specs: { 'e2e/a.spec.ts': ['x', 'y'], 'e2e/b.spec.ts': ['z'], 'e2e/gone.spec.ts': ['q'] },
  };
  const recorded = new Map([
    ['e2e/a.spec.ts', new Set(['x'])],
    ['e2e/b.spec.ts', new Set(['w'])],
  ]);

  it('replaces clean full-run entries, adds to the rest, and drops deleted specs', () => {
    const next = mergeMap(old, recorded, {
      replace: new Set(['e2e/a.spec.ts']),
      specs: ['e2e/a.spec.ts', 'e2e/b.spec.ts', 'e2e/c.spec.ts'],
    });
    assert.deepEqual(next.specs, { 'e2e/a.spec.ts': ['x'], 'e2e/b.spec.ts': ['w', 'z'] });
  });
});

describe('parseReport', () => {
  it('keys tests by spec:line and marks failures, flakes and skips', () => {
    const appAbs = process.platform === 'win32' ? 'C:\\repo\\apps\\x' : '/repo/apps/x';
    const rootDir = process.platform === 'win32' ? 'C:\\repo\\apps\\x\\e2e' : '/repo/apps/x/e2e';
    const report = {
      config: { rootDir },
      suites: [
        {
          specs: [{ file: 'a.spec.ts', line: 3, tests: [{ status: 'expected' }] }],
          suites: [
            {
              specs: [
                { file: 'a.spec.ts', line: 9, tests: [{ status: 'unexpected' }] },
                { file: 'a.spec.ts', line: 12, tests: [{ status: 'flaky' }] },
                { file: 'a.spec.ts', line: 15, tests: [{ status: 'skipped' }] },
              ],
            },
          ],
        },
      ],
    };
    assert.deepEqual(parseReport(report, appAbs), [
      { spec: 'e2e/a.spec.ts', key: 'e2e/a.spec.ts:3', ok: true },
      { spec: 'e2e/a.spec.ts', key: 'e2e/a.spec.ts:9', ok: false },
      { spec: 'e2e/a.spec.ts', key: 'e2e/a.spec.ts:12', ok: true },
      { spec: 'e2e/a.spec.ts', key: 'e2e/a.spec.ts:15', ok: null },
    ]);
  });
});
