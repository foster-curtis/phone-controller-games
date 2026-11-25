// The debug `card` command (SPEC §9.5, RD6-fix-2): a give goes through the pick's apply path (the same
// stacks, modifiers and stats as a real pick), in the build phase and in combat, bypasses `requires`,
// and refuses a second copy of a unique card and another knight's card.
import { describe, expect, it } from 'vitest';
import { content } from '../../../content';
import { KNIGHT_IDS, type CardId, type ClassId } from '../../../shared/ids';
import type { PlayerEnt } from '../types';
import { harness } from './harness';

/** The player minus the offer state a pick sets (a give leaves the offer alone). */
const applied = (p: PlayerEnt) => {
  const { offer: _o, picked: _p, ...rest } = p;
  return JSON.parse(JSON.stringify(rest)) as unknown;
};

const ownCards = (k: ClassId) =>
  content.cards.filter((c) => c.owner === 'common' || c.owner === k).map((c) => c.id);

const prereqs = (id: CardId): CardId[] => content.cards.find((c) => c.id === id)?.requires ?? [];

describe('debug give: the pick path', () => {
  it('gives every card exactly the effect a pick does (each knight, two stacks where allowed)', () => {
    for (const k of KNIGHT_IDS) {
      for (const card of ownCards(k)) {
        const unique =
          (content.cards.find((c) => c.id === card)!.unique ?? false) || prereqs(card).length >= 2;
        const seq = [...prereqs(card), card, ...(unique ? [] : [card])];
        const picked = harness(1, 3, { classes: [k] });
        const given = harness(1, 3, { classes: [k] });
        picked.toBuild();
        given.toBuild();
        // Vitality and friends: start hurt so the HP top-up shows.
        picked.p(0).hp = given.p(0).hp = 10;
        for (const id of seq) {
          picked.give(0, id);
          given.sim.command({ c: 'debug', slot: -1, action: 'card', target: 0, card: id });
          given.run(1);
        }
        expect(given.p(0).cards, `${k} ${card}`).toEqual(picked.p(0).cards);
        expect(applied(given.p(0)), `${k} ${card}`).toEqual(applied(picked.p(0)));
        // The give leaves the offer alone and shows no pick.
        expect(given.p(0).picked).toBeNull();
      }
    }
  });

  it('works in combat and leaves no cardPicked event', () => {
    const h = harness(1, 1, { classes: ['warden'] });
    h.toCombat();
    h.holdSpawns();
    h.sim.command({ c: 'debug', slot: -1, action: 'card', target: 0, card: 'might', ref: 4 });
    h.run(1);
    expect(h.events('command')).toEqual([{ e: 'command', ref: 4, slot: -1, ok: true }]);
    expect(h.events('cardPicked')).toEqual([]);
    expect(h.sim.world.phase).toBe('combat');
    expect(h.p(0).cards.might).toBe(1);
    expect(h.p(0).mods.some((m) => m.id === 'card:might')).toBe(true);
  });
});

describe('debug give: rules', () => {
  const give = (h: ReturnType<typeof harness>, card: CardId, ref: number, target = 0) => {
    h.sim.command({ c: 'debug', slot: -1, action: 'card', target, card, ref });
    h.run(1);
    return h.events('command')[0];
  };

  it('refuses a second copy of a unique passive, and of a combo', () => {
    const h = harness(1, 1, { classes: ['ranger'] });
    h.toBuild();
    expect(give(h, 'steady_aim', 1)).toMatchObject({ ok: true });
    expect(give(h, 'steady_aim', 2)).toMatchObject({ ok: false, reason: 'cap' });
    expect(h.p(0).cards.steady_aim).toBe(1);
    expect(give(h, 'wildfire', 3)).toMatchObject({ ok: true });
    expect(give(h, 'wildfire', 4)).toMatchObject({ ok: false, reason: 'cap' });
    expect(h.p(0).cards.wildfire).toBe(1);
  });

  it('bypasses requires: Deadeye without Steady Aim, a combo without its parts', () => {
    const h = harness(1, 1, { classes: ['ranger'] });
    h.toCombat();
    expect(give(h, 'deadeye', 1)).toMatchObject({ ok: true });
    expect(give(h, 'wildfire', 2)).toMatchObject({ ok: true });
    expect(h.p(0).cards).toEqual({ deadeye: 1, wildfire: 1 });
  });

  it("refuses another knight's card and an unknown slot", () => {
    const h = harness(2, 1, { classes: ['ranger', 'warden'] });
    h.toBuild();
    expect(give(h, 'challenger', 1, 0)).toMatchObject({ ok: false, reason: 'invalid' });
    expect(give(h, 'challenger', 2, 1)).toMatchObject({ ok: true });
    expect(give(h, 'might', 3, 7)).toMatchObject({ ok: false, reason: 'invalid' });
    expect(h.p(0).cards).toEqual({});
  });
});
