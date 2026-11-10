// @vitest-environment jsdom
// The version comes from package.json and the tag shows it (PLATFORM §5).
import { describe, expect, it } from 'vitest';
import pkg from '../../../package.json';
import { GAME_VERSION, mountVersionTag } from '../version';

describe('version', () => {
  it('is the package.json version, as semver', () => {
    expect(GAME_VERSION).toBe(pkg.version);
    expect(GAME_VERSION).toMatch(/^\d+\.\d+\.\d+(-[\w.]+)?$/);
  });

  it('mounts an untappable v-tag', () => {
    const tag = mountVersionTag(document.body);
    expect(tag.textContent).toBe(`v${GAME_VERSION}`);
    expect(tag.classList.contains('version-tag')).toBe(true);
    expect(tag.style.pointerEvents).toBe('none');
    tag.remove();
  });
});
