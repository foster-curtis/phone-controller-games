// Emoji feed (SPEC §6.6): cooldown, cap, photographer and range checks.
import { describe, expect, it } from 'vitest';
import { createEmojiFeed } from '..';

function setup() {
  let t = 1000;
  const feed = createEmojiFeed({ now: () => t });
  return {
    feed,
    advance: (ms: number) => {
      t += ms;
    },
  };
}

describe('emoji feed (SPEC §6.6)', () => {
  it('drops a second emoji from the same phone within 500 ms', () => {
    const { feed, advance } = setup();
    expect(feed.accept('p1', 1, true).added).not.toBeNull();
    advance(499);
    expect(feed.accept('p1', 2, true).added).toBeNull();
    expect(feed.accept('p2', 2, true).added).not.toBeNull();
    advance(1);
    expect(feed.accept('p1', 2, true).added).not.toBeNull();
    expect(feed.items()).toHaveLength(3);
  });

  it('evicts the oldest when the 13th arrives', () => {
    const { feed } = setup();
    const first = feed.accept('p0', 0, true).added!;
    for (let n = 1; n < 12; n++) feed.accept(`p${n}`, 0, true);
    expect(feed.items()).toHaveLength(12);
    const r = feed.accept('p12', 0, true);
    expect(r.evicted?.id).toBe(first.id);
    expect(feed.items()).toHaveLength(12);
    expect(feed.items()[0]!.id).not.toBe(first.id);
  });

  it('ignores a disallowed sender (the photographer, wrong phase)', () => {
    const { feed } = setup();
    expect(feed.accept('ph', 0, false).added).toBeNull();
    expect(feed.items()).toHaveLength(0);
  });

  it('ignores out-of-range indexes', () => {
    const { feed } = setup();
    for (const i of [-1, 5, 1.5, NaN]) expect(feed.accept('p1', i, true).added).toBeNull();
    expect(feed.items()).toHaveLength(0);
  });

  it('remove and clear', () => {
    const { feed, advance } = setup();
    const a = feed.accept('a', 0, true).added!;
    advance(600);
    feed.accept('a', 1, true);
    feed.remove(a.id);
    expect(feed.items()).toHaveLength(1);
    feed.clear();
    expect(feed.items()).toHaveLength(0);
  });
});
