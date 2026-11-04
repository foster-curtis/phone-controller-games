// Card offers over real content (SPEC §6.1, §15.3): seeded per wave and slot, the picker's
// exclusions, guaranteed rares after the boss waves, private picks and stacking.
import { describe, expect, it } from 'vitest';
import { content } from '../../../content';
import type { CardDef } from '../../../content/types';
import type { CardId, ClassId } from '../../../shared/ids';
import { eligibleFor } from '../cards';
import { createCatalog } from '../catalog';
import { guaranteedRare, offerFor } from '../index';
import type { PlayerEnt, SimEvent } from '../types';
import { harness, type Harness } from './harness';

const cat = createCatalog(content, 'normal');
const def = (id: CardId) => content.cards.find((c) => c.id === id)!;
const rare = (id: CardId) => def(id).tier !== 'common';

function jump(h: Harness, wave: number) {
  h.sim.command({ c: 'debug', slot: -1, action: 'jumpWave', wave });
  h.run(1);
}

function ack(h: Harness, cmd: Parameters<Harness['sim']['command']>[0]) {
  h.sim.command({ ...cmd, ref: 99 });
  h.run(1);
  return h.events('command').find((e) => e.ref === 99) as Extract<SimEvent, { e: 'command' }>;
}

const ALL: ClassId[] = ['engineer', 'warden', 'quartermaster', 'commander'];

describe('offers', () => {
  it('every build phase deals each player 3 distinct cards of their class or the commons', () => {
    const h = harness(4, 3, { classes: ALL });
    h.toBuild();
    for (const wave of [1, 2, 3, 7]) {
      if (wave > 1) jump(h, wave);
      for (const p of h.sim.world.players) {
        expect(p.offer).toHaveLength(3);
        expect(new Set(p.offer).size).toBe(3);
        for (const id of p.offer!) expect(['common', p.classId]).toContain(def(id).owner);
        expect(p.offer!.filter(rare).length).toBeLessThanOrEqual(1);
      }
    }
  });

  it('comes from the stream cards:<wave>:<slot>: the same seed gives the same offer, and recomputing it matches', () => {
    const a = harness(2, 11, { classes: ['engineer', 'warden'] });
    const b = harness(2, 11, { classes: ['engineer', 'warden'] });
    a.toBuild();
    b.toBuild();
    for (const s of [0, 1]) {
      expect(a.p(s).offer).toEqual(b.p(s).offer);
      expect(offerFor(cat, a.sim.world, a.p(s))).toEqual(a.p(s).offer);
    }
    // Another seed changes some offer.
    const offers = new Set<string>();
    for (let seed = 1; seed <= 8; seed++) {
      const h = harness(1, seed);
      h.toBuild();
      offers.add(h.p(0).offer!.join());
    }
    expect(offers.size).toBeGreaterThan(1);
  });

  it('includes a guaranteed rare after waves 5 and 10 (the boss waves), and only then', () => {
    expect(guaranteedRare(cat, 6)).toBe(true);
    expect(guaranteedRare(cat, 11)).toBe(true);
    for (const n of [1, 2, 3, 4, 5, 7, 8, 9, 10, 12]) expect(guaranteedRare(cat, n)).toBe(false);
    for (let seed = 1; seed <= 12; seed++) {
      const h = harness(4, seed, { classes: ALL });
      h.toBuild();
      for (const wave of [6, 11]) {
        jump(h, wave);
        for (const p of h.sim.world.players) expect(p.offer!.filter(rare)).toHaveLength(1);
      }
    }
  });

  it('rares show up in about 15% of other offers', () => {
    let withRare = 0;
    let total = 0;
    for (let seed = 1; seed <= 100; seed++) {
      const h = harness(1, seed);
      h.toBuild();
      total++;
      if (h.p(0).offer!.some(rare)) withRare++;
    }
    expect(withRare / total).toBeGreaterThan(0.05);
    expect(withRare / total).toBeLessThan(0.3);
  });
});

describe('picker exclusions (real content)', () => {
  const eligible = (h: Harness, p: PlayerEnt, id: CardId) =>
    eligibleFor(cat, h.sim.world, p)(def(id) as CardDef);

  it('excludes Skyhunter when Flyers are substituted (no ranged class connected)', () => {
    const h = harness(2, 1, { classes: ['engineer', 'warden'] });
    h.toBuild();
    const eng = h.p(0);
    expect(eligible(h, eng, 'skyhunter')).toBe(true);
    h.sim.command({ c: 'presence', slot: 0, connected: false });
    h.run(1);
    expect(eligible(h, eng, 'skyhunter')).toBe(false);
    // Over many seeds, a dealt offer never holds it.
    for (let seed = 1; seed <= 40; seed++) {
      const g = harness(2, seed, { classes: ['engineer', 'warden'] });
      g.sim.command({ c: 'presence', slot: 0, connected: false });
      g.toBuild();
      expect(g.p(0).offer).not.toContain('skyhunter');
    }
  });

  it('keeps Giant Slayer and Siege Breakers while their enemies can still spawn', () => {
    const h = harness(2, 1, { classes: ['warden', 'commander'] });
    h.toBuild();
    expect(eligible(h, h.p(0), 'giant_slayer')).toBe(true);
    expect(eligible(h, h.p(1), 'siege_breakers')).toBe(true);
  });

  it('gates combos by both prerequisites, and drops unique cards once owned', () => {
    const h = harness(1, 1, { classes: ['engineer'] });
    h.toBuild();
    const p = h.p(0);
    expect(eligible(h, p, 'wildfire')).toBe(false);
    h.give(0, 'fire_arrows');
    expect(eligible(h, p, 'wildfire')).toBe(false);
    h.give(0, 'piercing_shot');
    expect(eligible(h, p, 'wildfire')).toBe(true);
    h.give(0, 'wildfire');
    expect(eligible(h, p, 'wildfire')).toBe(false);
    // Stackable cards stay offered.
    expect(eligible(h, p, 'fire_arrows')).toBe(true);
    const w = harness(1, 1, { classes: ['warden'] });
    w.toBuild();
    w.give(0, 'unshakable');
    expect(eligible(w, w.p(0), 'unshakable')).toBe(false);
    // Other classes' cards never.
    expect(eligible(w, w.p(0), 'volley')).toBe(false);
  });
});

describe('picks', () => {
  it('a private pick from the offer adds a stack (×N); one pick per phase, build only', () => {
    const h = harness(1, 5);
    h.toBuild();
    const p = h.p(0);
    const offer = p.offer!;
    const other = content.cards.find((c) => !offer.includes(c.id))!.id;
    expect(ack(h, { c: 'card', slot: 0, card: other }).reason).toBe('invalid');
    expect(ack(h, { c: 'card', slot: 0, card: offer[0]! }).ok).toBe(true);
    expect(p.cards[offer[0]!]).toBe(1);
    expect(p.picked).toBe(offer[0]);
    expect(ack(h, { c: 'card', slot: 0, card: offer[1]! }).reason).toBe('invalid');
    const had = p.cards.might ?? 0;
    h.give(0, 'might', 2);
    expect(p.cards.might).toBe(had + 2);
    expect(p.mods.filter((m) => m.id === 'card:might')).toHaveLength(1);
    h.toCombat();
    expect(p.offer).toBeNull();
    expect(ack(h, { c: 'card', slot: 0, card: 'might' }).reason).toBe('phase');
  });

  it('announces the pick for audio and phones (cardPicked)', () => {
    const h = harness(1, 5);
    h.toBuild();
    const card = h.p(0).offer![0]!;
    h.sim.command({ c: 'card', slot: 0, card });
    h.run(1);
    expect(h.events('cardPicked')).toEqual([{ e: 'cardPicked', slot: 0, card }]);
  });
});
