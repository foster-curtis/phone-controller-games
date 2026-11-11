import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { catalogOptions, decide } from '../vercel-ignore.mjs';

const pkg = (version) => JSON.stringify({ name: '@pcg/say-cheese', version });

/** A fake repo: package.json per commit, and which paths changed since each commit. */
function io({ versions = {}, changedPaths = {} } = {}) {
  return {
    show: (sha, path) =>
      path === 'apps/say-cheese/package.json' && sha in versions ? pkg(versions[sha]) : null,
    changed: (from, paths) =>
      from in changedPaths
        ? paths.some((p) => changedPaths[from].some((c) => c.startsWith(p)))
        : null,
  };
}

describe('vercel-ignore', () => {
  const production = { VERCEL_ENV: 'production', VERCEL_GIT_PREVIOUS_SHA: 'abc' };

  it('production + version bump → build', () => {
    const r = decide({
      app: 'say-cheese',
      env: production,
      ...io({ versions: { abc: '1.0.0', HEAD: '1.0.1' } }),
    });
    assert.equal(r.build, true);
  });

  it('production + no bump → skip', () => {
    const r = decide({
      app: 'say-cheese',
      env: production,
      ...io({ versions: { abc: '1.0.0', HEAD: '1.0.0' } }),
    });
    assert.equal(r.build, false);
  });

  it('production + unreadable previous commit → build', () => {
    const r = decide({
      app: 'say-cheese',
      env: production,
      ...io({ versions: { HEAD: '1.0.0' } }),
    });
    assert.equal(r.build, true);
  });

  it('production without VERCEL_GIT_PREVIOUS_SHA compares against HEAD^', () => {
    const env = { VERCEL_ENV: 'production' };
    assert.equal(
      decide({ app: 'say-cheese', env, ...io({ versions: { 'HEAD^': '1.0.0', HEAD: '1.0.0' } }) })
        .build,
      false,
    );
    assert.equal(
      decide({ app: 'say-cheese', env, ...io({ versions: { 'HEAD^': '1.0.0', HEAD: '1.1.0' } }) })
        .build,
      true,
    );
  });

  it('preview with app changes → build', () => {
    const env = { VERCEL_ENV: 'preview', VERCEL_GIT_PREVIOUS_SHA: 'abc' };
    const r = decide({
      app: 'say-cheese',
      env,
      ...io({ changedPaths: { abc: ['apps/say-cheese/src/host/main.ts'] } }),
    });
    assert.equal(r.build, true);
  });

  it('preview with only another app’s changes → skip', () => {
    const env = { VERCEL_ENV: 'preview', VERCEL_GIT_PREVIOUS_SHA: 'abc' };
    const r = decide({
      app: 'say-cheese',
      env,
      ...io({ changedPaths: { abc: ['apps/fort-frenzy/src/host/main.ts', 'README.md'] } }),
    });
    assert.equal(r.build, false);
  });

  it('preview with package or lockfile changes → build; undiffable → build', () => {
    const env = { VERCEL_ENV: 'preview' };
    assert.equal(
      decide({
        app: 'say-cheese',
        env,
        ...io({ changedPaths: { 'HEAD^': ['packages/game-kit/src/rng.ts'] } }),
      }).build,
      true,
    );
    assert.equal(
      decide({ app: 'say-cheese', env, ...io({ changedPaths: { 'HEAD^': ['pnpm-lock.yaml'] } }) })
        .build,
      true,
    );
    assert.equal(decide({ app: 'say-cheese', env, ...io() }).build, true);
  });
});

describe('vercel-ignore --catalog (the gallery)', () => {
  const games = ['sunny-side', 'say-cheese'];
  const opts = {
    app: 'gallery',
    alsoVersions: games.map((g) => `apps/${g}`),
    alsoPaths: games.flatMap((g) => [`apps/${g}/game.meta.ts`, `apps/${g}/catalog`]),
  };

  /** `versions`: { 'apps/<dir>': { <sha>: version } }; a missing sha means no package.json there. */
  function catalogIo({ versions = {}, changedPaths = {} } = {}) {
    return {
      show: (sha, path) => {
        const v = versions[path.replace(/\/package\.json$/, '')]?.[sha];
        return v === undefined ? null : JSON.stringify({ version: v });
      },
      changed: (from, paths) =>
        from in changedPaths
          ? paths.some((p) => changedPaths[from].some((c) => c === p || c.startsWith(`${p}/`)))
          : null,
    };
  }

  const unchanged = {
    'apps/gallery': { abc: '0.1.0', HEAD: '0.1.0' },
    'apps/sunny-side': { abc: '1.0.0', HEAD: '1.0.0' },
    'apps/say-cheese': { abc: '1.0.0', HEAD: '1.0.0' },
  };
  const production = { VERCEL_ENV: 'production', VERCEL_GIT_PREVIOUS_SHA: 'abc' };
  const preview = { VERCEL_ENV: 'preview', VERCEL_GIT_PREVIOUS_SHA: 'abc' };

  it('production with only a game bump → build', () => {
    const versions = { ...unchanged, 'apps/say-cheese': { abc: '1.0.0', HEAD: '1.0.1' } };
    const r = decide({ ...opts, env: production, ...catalogIo({ versions }) });
    assert.equal(r.build, true);
    assert.match(r.why, /say-cheese/);
  });

  it('production with a gallery bump → build', () => {
    const versions = { ...unchanged, 'apps/gallery': { abc: '0.1.0', HEAD: '0.1.1' } };
    assert.equal(decide({ ...opts, env: production, ...catalogIo({ versions }) }).build, true);
  });

  it('production with no bumps → skip', () => {
    const r = decide({ ...opts, env: production, ...catalogIo({ versions: unchanged }) });
    assert.equal(r.build, false);
  });

  it('production with a new game (no package.json at the previous commit) → build', () => {
    const versions = { ...unchanged, 'apps/say-cheese': { HEAD: '0.1.0' } };
    assert.equal(decide({ ...opts, env: production, ...catalogIo({ versions }) }).build, true);
  });

  it('production with an unreadable gallery version → build', () => {
    const versions = { ...unchanged, 'apps/gallery': { abc: '0.1.0' } };
    assert.equal(decide({ ...opts, env: production, ...catalogIo({ versions }) }).build, true);
  });

  it('preview with only a game.meta.ts or catalog/ change → build', () => {
    for (const file of ['apps/say-cheese/game.meta.ts', 'apps/sunny-side/catalog/card.jpg']) {
      const r = decide({ ...opts, env: preview, ...catalogIo({ changedPaths: { abc: [file] } }) });
      assert.equal(r.build, true, file);
    }
  });

  it('preview with only a game’s src/ change → skip', () => {
    const changedPaths = {
      abc: ['apps/say-cheese/src/host/main.ts', 'apps/sunny-side/index.html'],
    };
    const r = decide({ ...opts, env: preview, ...catalogIo({ changedPaths }) });
    assert.equal(r.build, false);
  });

  it('preview with a gallery change → build', () => {
    const changedPaths = { abc: ['apps/gallery/index.html'] };
    assert.equal(decide({ ...opts, env: preview, ...catalogIo({ changedPaths }) }).build, true);
  });

  it('catalogOptions() lists every apps/* folder with a game.meta.ts', () => {
    const { alsoVersions, alsoPaths } = catalogOptions();
    for (const g of ['sunny-side', 'fort-frenzy', 'say-cheese']) {
      assert.ok(alsoVersions.includes(`apps/${g}`), g);
      assert.ok(alsoPaths.includes(`apps/${g}/game.meta.ts`), g);
      assert.ok(alsoPaths.includes(`apps/${g}/catalog`), g);
    }
    assert.ok(!alsoVersions.includes('apps/gallery'));
    assert.ok(!alsoVersions.includes('apps/relay'));
  });
});
