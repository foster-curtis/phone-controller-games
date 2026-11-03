// Pure helpers (SPEC §6.2 shutter, §6.4 tag sheet; SC3 acceptance).
import { describe, expect, it } from 'vitest';
import type { PlayerSummary, TagView } from '../../shared/messages';
import { initialShutter, shootOver, takeShot, type ShutterRules } from '../review/shutter';
import { tagSheetModel } from '../review/tagSheet';

const rules: ShutterRules = { cooldownMs: 400, maxShots: 15, deadlineAt: 20_000 };

function tap(times: number[], r = rules) {
  let s = initialShutter();
  for (const t of times) s = takeShot(s, r, t) ?? s;
  return s.shots;
}

describe('shutter', () => {
  it('two taps 300 ms apart are one shot', () => expect(tap([1000, 1300])).toBe(1));
  it('two taps 500 ms apart are two shots', () => expect(tap([1000, 1500])).toBe(2));
  it('no shot after 15', () => {
    const times = Array.from({ length: 20 }, (_, i) => 500 * (i + 1));
    expect(tap(times, { ...rules, deadlineAt: 99_999 })).toBe(15);
  });
  it('no shot after the local deadline', () => expect(tap([19_000, 20_000, 20_500])).toBe(1));
  it('reports the end at the cap or the deadline', () => {
    expect(shootOver({ shots: 15, lastAt: 0 }, rules, 5)).toBe(true);
    expect(shootOver({ shots: 3, lastAt: 0 }, rules, 20_000)).toBe(true);
    expect(shootOver({ shots: 3, lastAt: 0 }, rules, 100)).toBe(false);
  });
});

const cands: PlayerSummary[] = [
  { playerId: 'a#0', name: 'Ann', color: 'crimson' },
  { playerId: 'b#0', name: 'Bo', color: 'cobalt' },
];
const tag = (tagId: string, playerId: TagView['playerId']): TagView => ({
  tagId,
  photo: 0,
  x: 0.5,
  y: 0.5,
  playerId,
});

describe('tagSheetModel', () => {
  it('disables tagged players, keeps Unknown, no Remove for a new circle', () => {
    const m = tagSheetModel(cands, [tag('t1', 'a#0')], null);
    expect(m.options.find((o) => o.name === 'Ann')?.disabled).toBe(true);
    expect(m.options.find((o) => o.name === 'Bo')?.disabled).toBe(false);
    expect(m.options.at(-1)).toMatchObject({ name: 'Unknown', playerId: null, disabled: false });
    expect(m.canRemove).toBe(false);
  });
  it('editing an existing circle offers Remove and frees its own player', () => {
    const t1 = tag('t1', 'a#0');
    const m = tagSheetModel(cands, [t1, tag('t2', 'b#0')], t1);
    expect(m.canRemove).toBe(true);
    expect(m.options.find((o) => o.name === 'Ann')).toMatchObject({
      disabled: false,
      selected: true,
    });
    expect(m.options.find((o) => o.name === 'Bo')?.disabled).toBe(true);
  });
  it('Unknown is never disabled even when another circle is Unknown', () => {
    const m = tagSheetModel(cands, [tag('t1', null)], null);
    expect(m.options.at(-1)?.disabled).toBe(false);
  });
});
