import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { decide } from '../vercel-ignore.mjs';

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
