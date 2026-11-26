// Soak, short form (SPEC §15.9, FF15, RD14): a whole solo run, a whole 2-player run and the boss waves
// with 6 players, each run twice, with no exceptions and identical state hashes; a solo run saved and
// resumed at a build phase plays on to the summary. The full form (two seeds × every knight solo,
// every pair and every six-player rotation, waves 1–15) is `pnpm --filter @pcg/fort-frenzy soak`
// (scripts/soak.ts).
import { describe, expect, it } from 'vitest';
import { content } from '../../../content';
import { CLASS_IDS } from '../../../shared/ids';
import { soakMixes, soakRun } from '../soak';

describe('soak (short form)', () => {
  it('every class mix is in the rotation', () => {
    expect(soakMixes(1)).toEqual(CLASS_IDS.map((c) => [c]));
    const pairs = soakMixes(2).map((m) => [...m].sort().join('+'));
    expect(new Set(pairs).size).toBe(10);
    for (const a of CLASS_IDS)
      for (const b of CLASS_IDS) expect(pairs).toContain([a, b].sort().join('+'));
    const six = soakMixes(6);
    expect(six).toHaveLength(CLASS_IDS.length);
    for (const m of six) expect(new Set(m).size).toBe(CLASS_IDS.length);
    // Every class in every slot across the rotation.
    for (let slot = 0; slot < 6; slot++) expect(new Set(six.map((m) => m[slot])).size).toBe(4);
  });

  it('a solo Commander plays waves 1–15 to the summary, and a rerun hashes the same', () => {
    const opts = { seed: 1, classes: ['commander'] as const };
    const a = soakRun(opts);
    expect([a.phase, a.result, a.wave]).toEqual(['summary', 'victory', 15]);
    expect(a.builds).toBeGreaterThan(0);
    expect(soakRun(opts).hashes).toEqual(a.hashes);
  }, 60_000);

  it('2 players play waves 1–15 to the summary, and a rerun hashes the same', () => {
    const opts = { seed: 1, classes: ['artificer', 'commander'] as const };
    const a = soakRun(opts);
    expect(a.phase).toBe('summary');
    expect(a.result).toBe('victory');
    expect(a.wave).toBe(15);
    expect(a.kinds).toContain('colossus');
    expect(a.cardsPicked).toBeGreaterThan(0);
    expect(a.purchases).toBeGreaterThan(0);
    expect(a.builds).toBeGreaterThan(0);
    const b = soakRun(opts);
    expect(b.hashes).toEqual(a.hashes);
  }, 60_000);

  it('6 players (every class) play the boss waves to the summary, and a rerun hashes the same', () => {
    const opts = {
      seed: 2,
      classes: soakMixes(6)[1]!,
      content: { ...content, waves: content.waves.filter((w) => w.n >= 14) },
    };
    const a = soakRun(opts);
    expect(a.phase).toBe('summary');
    expect(a.wave).toBe(15);
    expect(a.kinds).toContain('colossus');
    const b = soakRun(opts);
    expect(b.hashes.length).toBeGreaterThan(10);
    expect(b.hashes).toEqual(a.hashes);
  }, 60_000);

  it('a solo Ranger saved and resumed at wave 8 round-trips and plays on to the summary', () => {
    // soakResume throws if the restore doesn't give the same snapshot back or two restores differ.
    const opts = { seed: 2, classes: ['ranger'] as const, resumeAt: 8 };
    const a = soakRun(opts);
    expect(a.resumed?.wave).toBe(8);
    expect(a.resumed?.builds.some((b) => b.kind === 'mine')).toBe(true);
    expect([a.phase, a.result, a.wave]).toEqual(['summary', 'victory', 15]);
    expect(soakRun(opts).hashes).toEqual(a.hashes);
  }, 60_000);
});
