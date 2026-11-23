// Content validation (SPEC §15.4): every referenced id exists, wave budgets cover their guaranteed
// spawns, the map and its six portals are well formed, the player-count table has one row per player
// count, and the balance sheet carries every number the sim reads.
import { describe, expect, it } from 'vitest';
import { CARD_INFO } from '../../controller/copy';
import { buildBehaviors } from '../../host/sim/builds';
import { aiKinds, bosses, modules } from '../../host/sim/registry';
import { generateWave, groupsCost, waveRng } from '../../host/systems/waves';
import {
  type CardId,
  BUILD_IDS,
  CARD_IDS,
  DIFFICULTY_IDS,
  ENEMY_IDS,
  KNIGHT_IDS,
  PORTAL_IDS,
  ROLE_IDS,
  SHOP_ITEM_IDS,
} from '../../shared/ids';
import { content } from '../index';
import type { ModuleRef, UpgradeTarget } from '../types';

const c = content;
const enemyIds = new Set(c.enemies.map((e) => e.id));
const cardIds = new Set(c.cards.map((x) => x.id));
const knightIds = new Set(c.knights.map((x) => x.id));

/** Card ids whose defs arrive with their milestone (each knight's kit, RD11's commons). */
const PENDING_CARDS: CardId[] = [
  'tinkerer',
  'shrapnel_charge',
  'steady_aim',
  'minefield',
  'wide_field',
  'challenger',
  'reinforced_generator',
  'fault_line',
  'strong_arm',
  'booster_beacon',
  'field_medic',
  'heavy_bash',
  'drillmaster',
  'morale',
  'reinforced_ranks',
];

function unique(ids: string[]) {
  expect(new Set(ids).size).toBe(ids.length);
}

describe('content ids', () => {
  it('every def uses a known id, once', () => {
    for (const x of c.knights) expect(KNIGHT_IDS).toContain(x.id);
    for (const x of c.classes) expect(ROLE_IDS).toContain(x.id);
    for (const x of c.builds) expect(BUILD_IDS).toContain(x.id);
    for (const x of c.enemies) expect(ENEMY_IDS).toContain(x.id);
    for (const x of c.cards) expect(CARD_IDS).toContain(x.id);
    for (const x of c.shop) expect(SHOP_ITEM_IDS).toContain(x.id);
    for (const x of c.difficulties) expect(DIFFICULTY_IDS).toContain(x.id);
    unique(c.knights.map((x) => x.id));
    unique(c.classes.map((x) => x.id));
    unique(c.builds.map((x) => x.id));
    unique(c.enemies.map((x) => x.id));
    unique(c.cards.map((x) => x.id));
    unique(c.shop.map((x) => x.id));
    unique(c.difficulties.map((x) => x.id));
    expect(c.difficulties.map((d) => d.id)).toContain('normal');
    expect(c.knights.map((k) => k.id).sort()).toEqual([...KNIGHT_IDS].sort());
    expect(c.classes.map((k) => k.id).sort()).toEqual([...ROLE_IDS].sort());
    expect(c.builds.map((k) => k.id).sort()).toEqual([...BUILD_IDS].sort());
  });

  it('knights reference their class, build, passive card and modules; one build each', () => {
    for (const k of c.knights) {
      expect(c.classes.map((x) => x.id)).toContain(k.role);
      const b = c.builds.find((x) => x.id === k.build);
      expect(b, k.id).toBeDefined();
      expect(k.input.build, k.id).toBe(b!.input);
      expect(CARD_IDS).toContain(k.passiveCard);
      if (k.passive) expect(Object.keys(modules)).toContain(k.passive.module);
    }
    unique(c.knights.map((k) => k.build));
  });

  it('builds: HP builds are targetable, charge builds are not; thrown builds have a throw', () => {
    for (const b of c.builds) {
      expect(b.traits.targetable, b.id).toBe(b.hp !== undefined);
      if (b.charges !== undefined) expect(b.traits.targetable).toBe(false);
      expect(b.input === 'aimed', b.id).toBe(b.throw !== undefined);
      expect(b.maxActive).toBeGreaterThanOrEqual(1);
      expect(b.radius).toBeGreaterThan(0);
      expect(b.bodyRadius).toBeGreaterThan(0);
    }
    expect(c.builds.find((b) => b.id === 'mine')!.maxActive).toBe(3);
  });

  it('cards: prerequisites, favored enemies, knights and modules exist', () => {
    for (const card of c.cards) {
      for (const r of card.requires ?? []) expect(CARD_IDS).toContain(r);
      if (card.favoredEnemy) expect(enemyIds).toContain(card.favoredEnemy);
      if (card.requiresKnight) expect(knightIds).toContain(card.requiresKnight);
      if (card.module) expect(Object.keys(modules)).toContain(card.module.module);
      if (card.owner !== 'common') expect(knightIds).toContain(card.owner);
    }
  });

  it('enemies have an AI and boss modules exist', () => {
    for (const e of c.enemies) {
      expect(Object.keys(aiKinds)).toContain(e.ai);
      if (e.boss) expect(Object.keys(bosses)).toContain(e.boss.module);
    }
  });

  it('shop: the six v2 items, targets exist', () => {
    const targets = new Set<UpgradeTarget>(['base', 'archers']);
    expect(c.shop.map((s) => s.id).sort()).toEqual([...SHOP_ITEM_IDS].sort());
    for (const item of c.shop) {
      expect(item.tiers.length).toBeGreaterThan(0);
      for (const t of item.tiers) {
        if (t.effect.kind === 'stats' || t.effect.kind === 'module')
          expect(targets).toContain(t.effect.target);
        if (t.effect.kind === 'module')
          expect(Object.keys(modules)).toContain(t.effect.module.module);
      }
    }
  });

  it('every card id has content except the ones still to come; commons are tuned per knight', () => {
    const missing = CARD_IDS.filter((id) => !cardIds.has(id));
    expect(missing.sort()).toEqual([...PENDING_CARDS].sort());
    const commons = c.cards.filter((x) => x.owner === 'common');
    for (const x of commons)
      for (const k of KNIGHT_IDS) expect(x.perKnight?.[k]?.length, x.id).toBeGreaterThan(0);
    // Every card does something: stats, per-knight stats or a registered module.
    for (const x of c.cards)
      expect(
        (x.stats?.length ?? 0) > 0 || x.module !== undefined || x.perKnight !== undefined,
      ).toBe(true);
  });

  it('combos need two cards of their own knight that are not combos; others at most one', () => {
    for (const x of c.cards.filter((k) => k.tier === 'combo')) {
      expect(x.requires).toHaveLength(2);
      for (const r of x.requires!) {
        const pre = c.cards.find((k) => k.id === r)!;
        expect(pre.owner).toBe(x.owner);
        expect(pre.tier).not.toBe('combo');
      }
    }
    for (const x of c.cards.filter((k) => k.tier !== 'combo'))
      expect((x.requires ?? []).length).toBeLessThanOrEqual(1);
  });

  it('favored enemies are ones the waves can spawn', () => {
    const spawnable = new Set(
      c.waves.flatMap((w) => [...w.allowed, ...(w.boss ? [w.boss.id] : [])]),
    );
    for (const x of c.cards) if (x.favoredEnemy) expect(spawnable).toContain(x.favoredEnemy);
  });

  it('shop tiers rise in price; base max HP and base armor have 3 tiers', () => {
    for (const item of c.shop) {
      const prices = item.tiers.map((t) => t.price);
      for (let i = 1; i < prices.length; i++) expect(prices[i]).toBeGreaterThan(prices[i - 1]!);
    }
    for (const id of ['base_hp', 'base_armor'])
      expect(c.shop.find((s) => s.id === id)?.tiers).toHaveLength(3);
  });

  it('waves: pools, guaranteed spawns and portals exist; budgets cover the guaranteed spawns', () => {
    expect(c.waves.map((w) => w.n)).toEqual(c.waves.map((_, i) => i + 1));
    for (const w of c.waves) {
      for (const id of w.allowed) expect(enemyIds).toContain(id);
      let cost = 0;
      for (const g of w.guaranteed) {
        expect(enemyIds).toContain(g.enemy);
        if (g.portal) expect(PORTAL_IDS).toContain(g.portal);
        cost += g.count * c.enemies.find((e) => e.id === g.enemy)!.budget;
      }
      expect(w.budget).toBeGreaterThanOrEqual(cost);
      if (w.boss) expect(c.enemies.find((e) => e.id === w.boss!.id)?.ai).toBe('boss');
    }
  });
});

describe('content rules', () => {
  it('the map is well formed: size, legend, a Citadel, six portals at §3.1’s tiles', () => {
    const m = c.map!;
    expect(m.tiles).toHaveLength(m.rows);
    for (const row of m.tiles) {
      expect(row).toHaveLength(m.cols);
      for (const ch of row) expect(Object.keys(m.legend)).toContain(ch);
    }
    const kind = (col: number, row: number) => m.legend[m.tiles[row]![col]!];
    expect(Object.keys(m.portals).sort()).toEqual([...PORTAL_IDS].sort());
    const tiles: Record<string, [number, number][]> = {
      'bottom-w': [
        [9, 23],
        [10, 23],
      ],
      'bottom-e': [
        [25, 23],
        [26, 23],
      ],
      'left-n': [
        [0, 11],
        [0, 12],
      ],
      'left-s': [
        [0, 18],
        [0, 19],
      ],
      'right-n': [
        [35, 11],
        [35, 12],
      ],
      'right-s': [
        [35, 18],
        [35, 19],
      ],
    };
    for (const id of PORTAL_IDS) {
      const p = m.portals[id];
      expect(p.side).toBe(id.split('-')[0]);
      expect(p.entry.map(([cc, r]) => [cc, r])).toEqual(tiles[id]);
      for (const [col, row] of p.entry) expect(kind(col, row)).toBe('portal');
      // Spawns sit just outside the edge.
      const outside = p.spawn.x < 0 || p.spawn.x > m.cols || p.spawn.y > m.rows;
      expect(outside, id).toBe(true);
    }
    const portalTiles = m.tiles
      .join('')
      .split('')
      .filter((ch) => m.legend[ch] === 'portal');
    expect(portalTiles).toHaveLength(12);
    expect(m.tiles.join('')).toContain('C');
    expect(m.tiles.join('')).not.toContain('#');
  });

  it('the base, rules and the player-count table are present and sane', () => {
    expect(c.base!.hp).toBeGreaterThan(0);
    expect(c.base!.archers.at.length).toBeGreaterThanOrEqual(c.base!.archers.count);
    expect(c.rules!.respawn.length).toBeGreaterThanOrEqual(6);
    expect(c.rules!.inputStaleMs).toBe(250);
    expect(c.rules!.flareMs).toBe(1000);
    expect(c.rules!.regen).toEqual({ delayMs: 5000, pct: 0.08, everyMs: 1000 });
    expect(c.rules!.respawnFloorMs).toEqual({ solo: 4000, team: 5000 });
    expect(c.rules!.hot.share).toBe(0.55);
    expect(c.scaling.map((r) => r.players)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(c.scaling.map((r) => r.budget)).toEqual([0.6, 1, 1.25, 1.5, 1.75, 2]);
    expect(c.scaling.map((r) => r.respawnMs)).toEqual([
      6000, 10_000, 10_000, 10_000, 15_000, 15_000,
    ]);
    for (const d of c.difficulties) expect(d.respawn).toBeGreaterThan(0);
    expect(PORTAL_IDS).toContain(c.harness!.portal);
    expect(c.harness!.seeds).toHaveLength(5);
    // RD3: the harness's spawn window and cap, and the 20 s build phase (§10.2).
    expect(c.harness!.durationMs).toBeGreaterThan(0);
    expect(c.harness!.capMs).toBeGreaterThan(c.harness!.durationMs!);
    expect(c.rules!.buildCapMs).toBe(20_000);
  });

  it('every build behavior reads its content params (RD3)', () => {
    for (const [id, beh] of Object.entries(buildBehaviors)) {
      const def = c.builds.find((b) => b.id === id)!;
      expect(() => beh!.check(def), id).not.toThrow();
    }
    expect(Object.keys(buildBehaviors)).toContain('shield_gen');
  });

  it('classes: §8.1’s HP tiers and damage bands', () => {
    const by = (id: string) => c.classes.find((x) => x.id === id)!;
    expect([by('tank').hp, by('marksman').hp, by('support').hp, by('control').hp]).toEqual([
      1.6, 0.8, 0.9, 1,
    ]);
    expect([
      by('tank').damage,
      by('marksman').damage,
      by('support').damage,
      by('control').damage,
    ]).toEqual([0.9, 1.15, 0.8, 0.95]);
  });
});

// The sim keeps no tuning numbers of its own (balance.ts header): modules throw on a missing param
// and the sim reads optional fields without fallbacks, so content must carry them.
describe('balance sheet (src/content/balance.ts)', () => {
  it('every passive, card and shop module builds from its content params', () => {
    const refs: ModuleRef[] = [
      ...c.knights.flatMap((k) => (k.passive ? [k.passive] : [])),
      ...c.cards.flatMap((x) => (x.module ? [x.module] : [])),
      ...c.shop.flatMap((s) =>
        s.tiers.flatMap((t) => (t.effect.kind === 'module' ? [t.effect.module] : [])),
      ),
    ];
    for (const ref of refs) {
      const make = () => modules[ref.module]!.make({ ...ref.params, stacks: 1 });
      expect(make, ref.module).not.toThrow();
    }
  });

  it('attacks, enemies and knights carry every field the sim reads', () => {
    const attacks = [
      ...c.knights.flatMap((k) => [k.main, k.super, ...(k.squad ? [k.squad.soldier.attack] : [])]),
      ...c.enemies.map((e) => e.attack),
      c.base!.archers.attack,
    ];
    for (const a of attacks) if (a.shape === 'projectile') expect(a.speed).toBeGreaterThan(0);
    // A knight's arc or cone needs its opening (classes/hitShape.ts).
    for (const k of c.knights)
      for (const a of [k.main, k.super])
        if (a.shape === 'arc' || a.shape === 'cone') expect(a.arcDeg, k.id).toBeGreaterThan(0);
    // Lobbed shells: the Bombard's.
    for (const a of c.enemies.filter((e) => e.ai === 'siege').map((e) => e.attack)) {
      expect(a.speed).toBeGreaterThan(0);
      expect(a.minFlightMs).toBeGreaterThan(0);
      expect(a.radius).toBeGreaterThan(0);
    }
    for (const e of c.enemies) {
      if (e.ai === 'swarm') expect(e.jitter, e.id).toBeDefined();
      if (e.ai === 'hunter') expect(e.hunt, e.id).toBeDefined();
      if (e.ai === 'boss') {
        expect(e.attack.windupMs).toBeGreaterThan(0);
        expect(e.attack.radius).toBeGreaterThan(0);
      }
    }
    for (const k of c.knights) {
      expect(k.superCharge.perDamage, k.id).toBeGreaterThan(0);
      if (k.squad) {
        expect(k.squad.start).toBe(2);
        expect(k.squad.cap).toBe(4);
        expect(k.squad.hurry, k.id).toBeDefined();
      }
    }
  });

  it('the phone card copy quotes the content numbers (controller/copy.ts)', () => {
    const card = (id: CardId) => c.cards.find((x) => x.id === id)!;
    const param = (id: CardId, key: string) => card(id).module!.params![key] as number;
    const pct = (v: number) => `${Math.round(v * 100)}%`;
    for (const mods of Object.values(card('quick_recovery').perKnight!))
      expect(CARD_INFO.quick_recovery.text).toContain(`${-mods[0]!.add! / 1000} s`);
    expect(CARD_INFO.skyhunter.text).toContain(pct(param('skyhunter', 'pct')));
    expect(CARD_INFO.giant_slayer.text).toContain(pct(param('giant_slayer', 'pct')));
    expect(CARD_INFO.siege_breakers.text).toContain(pct(param('siege_breakers', 'pct')));
    expect(CARD_INFO.triage.text).toContain(pct(param('triage', 'below')));
    expect(CARD_INFO.volley.text).toBe(
      `Every ${param('volley', 'every')}th shot fires ${param('volley', 'arrows')} arrows.`,
    );
    // "Double healing".
    expect(param('triage', 'mult')).toBe(2);
  });
});

describe('waves 1–15 (SPEC §9.3, §9.4)', () => {
  const byId = new Map(c.enemies.map((e) => [e.id, e]));

  it('are hand-authored for 1–15 with §9.4’s introductions, boss waves and hot schedules', () => {
    expect(c.waves.map((w) => w.n)).toEqual(Array.from({ length: 15 }, (_, i) => i + 1));
    const intro: Record<number, string> = {
      2: 'runner',
      3: 'swarm',
      4: 'brute',
      6: 'flyer',
      7: 'siege',
      8: 'hunter',
    };
    const seen = new Set<string>(['grunt']);
    for (const w of c.waves) {
      const fresh = w.allowed.filter((id) => !seen.has(id));
      if (intro[w.n]) {
        expect(fresh).toEqual([intro[w.n]]);
        expect(w.guaranteed.map((g) => g.enemy)).toContain(intro[w.n]);
      } else expect(fresh).toEqual([]);
      for (const id of w.allowed) seen.add(id);
      expect(w.boss?.id).toBe([5, 10, 15].includes(w.n) ? 'colossus' : undefined);
      expect(w.durationMs).toBeGreaterThanOrEqual(30_000);
      expect(w.durationMs).toBeLessThanOrEqual(90_000);
    }
    expect(c.waves.map((w) => w.boss?.mk).filter(Boolean)).toEqual([1, 2, 3]);
    const hot = (n: number) => c.waves.find((w) => w.n === n)!.hot;
    for (const n of [1, 2, 3, 5, 10]) expect(hot(n)).toEqual({ mode: 'wave', shifts: 0 });
    for (const n of [4, 6, 7, 8]) expect(hot(n)).toEqual({ mode: 'wave', shifts: 1 });
    for (const n of [9, 11]) expect(hot(n)).toEqual({ mode: 'wave', shifts: 2 });
    for (const n of [12, 13, 14, 15]) expect(hot(n)).toEqual({ mode: 'group' });
  });

  it('the generator spends every wave to within ±1 of its budget over the six portals', () => {
    for (const w of c.waves) {
      const pool = w.allowed.map((id) => ({
        id,
        cost: byId.get(id)!.budget,
        groupSize: byId.get(id)!.groupSize,
      }));
      const ground = w.allowed.filter((id) => !byId.get(id)!.flying);
      for (const d of c.difficulties) {
        for (const row of c.scaling) {
          for (const flyers of [true, false]) {
            for (const seed of [1, 2, 3]) {
              const budget = w.budget * row.budget * d.budget;
              const groups = generateWave({
                budget,
                pool,
                guaranteed: w.guaranteed.map((g) => ({
                  id: g.enemy,
                  count: g.count,
                  lane: g.portal,
                })),
                lanes: PORTAL_IDS,
                durationMs: w.durationMs,
                substitute: flyers ? undefined : { flyer: ground },
                rng: waveRng(seed, w.n),
              });
              const spent = groupsCost(groups, pool);
              expect(Math.abs(spent - budget), `wave ${w.n}`).toBeLessThanOrEqual(1);
              if (!flyers) expect(groups.some((g) => g.id === 'flyer')).toBe(false);
              for (const g of groups) expect(PORTAL_IDS).toContain(g.lane);
              for (const g of groups) expect(g.count).toBe(byId.get(g.id)!.groupSize ?? 1);
            }
          }
        }
      }
    }
  });
});
