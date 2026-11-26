// The run's phone views (SPEC §10.1, §10.2, §15.6; RD6): `MeView.build` (meter, input, icon, mode),
// the card state and the class growth header, and a `TeamView` that never names the hot side.
import { describe, expect, it } from 'vitest';
import { content as baseContent, type Content } from '../../../content';
import { isMeView, isTeamView } from '../../../shared/messages';
import { harness } from '../../sim/__tests__/harness';
import { buildFor, growthFor, meView, teamView, type FfParty, type ViewCtx } from '../views';
import { createParty } from '../../party';
import { PLAYER_COLOR_IDS, type ClassId, type PlayerColorId } from '../../../shared/ids';

function ctxOf(h: ReturnType<typeof harness>, content: Content = baseContent): ViewCtx {
  const party: FfParty = createParty<PlayerColorId, ClassId>({
    colors: PLAYER_COLOR_IDS,
    maxPlayers: 6,
    minPlayers: 1,
  });
  party.connect({ playerId: 'a', key: 'ka', deviceId: 'da' });
  party.setName('a', 'Ann');
  party.setClass('a', h.p(0).classId);
  party.setReady('a', true);
  party.startRun();
  return { party, content, settings: { difficulty: 'normal' }, world: h.sim.world, summary: null };
}

describe('MeView.build (§10.1)', () => {
  it('the Warden: aimed shield generator, full at the start, placeable only in combat', () => {
    const h = harness(1, 1, { classes: ['warden'] });
    h.toBuild();
    const w = h.sim.world;
    expect(buildFor(baseContent, w, h.p(0))).toEqual({
      id: 'shield_gen',
      input: 'aimed',
      icon: 'act-shield',
      meter: 1,
      full: true,
      mode: 'none',
      active: 0,
    });
    h.toCombat();
    expect(buildFor(baseContent, w, h.p(0))).toMatchObject({ full: true, mode: 'place' });
    h.p(0).meter = 0.456;
    expect(buildFor(baseContent, w, h.p(0))).toMatchObject({
      meter: 0.46,
      full: false,
      mode: 'none',
    });
    // Down or dazed: dimmed.
    h.p(0).meter = 1;
    h.p(0).connected = false;
    expect(buildFor(baseContent, w, h.p(0)).mode).toBe('none');
  });
});

describe('card state and the growth header (§10.2)', () => {
  it('deals the offer in the build phase; a pick sets `picked`; both clear in combat', () => {
    const h = harness(1, 1, { classes: ['warden'] });
    h.toBuild();
    const ctx = ctxOf(h);
    const m = ctx.party.member('a');
    let me = meView(ctx, m);
    expect(me.screen).toBe('build');
    expect(me.cards.offer).toHaveLength(3);
    expect(me.cards.picked).toBeNull();
    expect(me.cards.growth).toBeNull(); // none before wave 1
    expect(isMeView(me)).toBe(true);
    const card = me.cards.offer![0]!;
    h.sim.command({ c: 'card', slot: 0, card });
    h.run(1);
    me = meView(ctx, m);
    expect(me.cards.picked).toBe(card);
    expect(me.cards.owned).toEqual([{ id: card, n: 1 }]);
    h.toCombat();
    me = meView(ctx, m);
    expect(me.cards.offer).toBeNull();
    expect(me.cards.picked).toBeNull();
  });

  it('the header names the stats the class grew for the wave just cleared', () => {
    const content: Content = {
      ...baseContent,
      classes: baseContent.classes.map((c) =>
        c.id === 'tank'
          ? {
              ...c,
              growth: {
                regular: [
                  { stat: 'maxHp', addPct: 0.05 },
                  { stat: 'damage', addPct: 0.04 },
                ],
                boss: [{ stat: 'healing', addPct: 0.1 }],
              },
            }
          : c,
      ),
    };
    const h = harness(1, 1, { classes: ['warden'] });
    h.toBuild();
    const p = h.p(0);
    const w = h.sim.world;
    expect(growthFor(content, w, p)).toBeNull();
    w.wave = 4;
    expect(growthFor(content, w, p)).toBeNull(); // no bump yet (a late joiner, #99)
    p.growth.regular = 3;
    expect(growthFor(content, w, p)).toEqual({
      wave: 3,
      boss: false,
      stats: ['maxHp', 'damage'],
      pct: { maxHp: 5, damage: 4 },
    });
    const bossWave = content.waves.find((x) => x.boss !== undefined)!.n;
    w.wave = bossWave + 1;
    p.growth.boss = 1;
    expect(growthFor(content, w, p)).toEqual({
      wave: bossWave,
      boss: true,
      stats: ['healing'],
      pct: { healing: 10 },
    });
    // The real tank grows HP and damage after a boss (RD11).
    expect(growthFor(baseContent, w, p)).toEqual({
      wave: bossWave,
      boss: true,
      stats: ['maxHp', 'damage'],
      pct: { maxHp: 8, damage: 3 },
    });
  });
});

describe('TeamView (§15.6)', () => {
  it('never names the hot side or a portal', () => {
    const h = harness(1, 1, { classes: ['warden'] });
    h.toBuild();
    const ctx = ctxOf(h);
    for (const phase of ['build', 'combat']) {
      if (phase === 'combat') h.toCombat();
      const team = teamView(ctx);
      expect(isTeamView(team)).toBe(true);
      const json = JSON.stringify(team);
      expect(json).not.toMatch(/"hot|"side|"portal|left-n|bottom-w|right-s/);
    }
  });
});
