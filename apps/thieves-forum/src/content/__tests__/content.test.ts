// Content data (SPEC §6.3, §6.5, §7, §12.4): items match items.json and the §6.5 table, grab times
// follow the rule, every §7 row has a balance key, no stall row is ever empty, and the layout has the
// §6.3 shape.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ALWAYS_OPEN,
  balance,
  CHEAP_ONE_OF,
  grabMs,
  ITEMS,
  itemsOf,
  LAYOUT,
  placementRule,
  SHOP_IDS,
  SHOPS,
} from '..';
import { theme } from '../../shared/theme';

const appRoot = join(import.meta.dirname, '..', '..', '..');
const json = JSON.parse(readFileSync(join(appRoot, 'art/forum/items/items.json'), 'utf8')) as {
  items: {
    id: string;
    shop: string;
    name: string;
    value: number;
    weight: number;
    grabMs: number;
    rarity: string;
    placement: 'counter' | 'back-shelf';
    file: string;
  }[];
};
const spec = readFileSync(join(appRoot, 'SPEC.md'), 'utf8');

/** SPEC §6.5 grab column, by item name. */
const GRAB_TABLE: Record<string, number> = {};
for (const m of spec.matchAll(/^\| [^|]+ \| ([^|]+) \| (\d+) \| (\d+) \| (\d+) \| (\w+) \|$/gm))
  GRAB_TABLE[m[1]!.trim()] = Number(m[4]);

describe('items', () => {
  it('match items.json field by field', () => {
    expect(ITEMS).toHaveLength(34);
    expect(ITEMS.map((i) => i.id)).toEqual(json.items.map((i) => i.id));
    for (const [n, i] of ITEMS.entries()) {
      const j = json.items[n]!;
      expect({
        id: i.id,
        shop: i.shop,
        name: i.name,
        value: i.value,
        weight: i.weight,
        rarity: i.rarity,
        placement: i.placement === 'shelf' ? 'back-shelf' : 'counter',
        file: i.icon,
      }).toEqual({ ...j, grabMs: undefined });
    }
  });

  it('grabMs equals the §6.5 table and items.json for all 34', () => {
    expect(Object.keys(GRAB_TABLE)).toHaveLength(34);
    for (const [n, i] of ITEMS.entries()) {
      expect(grabMs(i), i.id).toBe(GRAB_TABLE[i.name]);
      expect(grabMs(i), i.id).toBe(json.items[n]!.grabMs);
      expect(grabMs(i, true)).toBe(grabMs(i) + balance.grab.reachPenaltyMs);
    }
  });

  it('ids are unique and icons exist', () => {
    expect(new Set(ITEMS.map((i) => i.id)).size).toBe(ITEMS.length);
    for (const i of ITEMS)
      expect(() => readFileSync(join(appRoot, 'art/forum', i.icon))).not.toThrow();
  });

  it('placement follows the §6.5 rule, and no counter or back shelf is empty', () => {
    for (const shop of SHOP_IDS) {
      const items = itemsOf(shop);
      if (!SHOPS[shop].sells) {
        expect(items, shop).toEqual([]);
        continue;
      }
      const rule = placementRule(items);
      for (const i of items) expect(i.placement, i.id).toBe(rule.get(i.id));
      expect(
        items.some((i) => i.placement === 'counter'),
        shop,
      ).toBe(true);
      expect(
        items.some((i) => i.placement === 'shelf'),
        shop,
      ).toBe(true);
    }
  });

  it('the fallback fills an empty row', () => {
    const mk = (id: string, value: number, rarity: 'common' | 'rare') =>
      ({
        id,
        shop: 'bakery',
        name: id,
        value,
        weight: 1,
        rarity,
        placement: 'counter',
        icon: '',
      }) as const;
    expect([...placementRule([mk('a', 5, 'rare'), mk('b', 9, 'rare')])]).toEqual([
      ['a', 'counter'],
      ['b', 'shelf'],
    ]);
    expect([...placementRule([mk('a', 5, 'common'), mk('b', 9, 'common')])]).toEqual([
      ['a', 'counter'],
      ['b', 'shelf'],
    ]);
  });
});

describe('shops', () => {
  it('10 shops with their brand canopy token and §6.3 color', () => {
    expect(Object.keys(SHOPS)).toEqual([...SHOP_IDS]);
    const hex: Record<string, string> = {
      pawnbroker: '#3a404b',
      bakery: '#d9cfb8',
      pottery: '#a85f45',
      clothing: '#5b7186',
      wine: '#9c5a63',
      smithy: '#7a5a43',
      perfume: '#8a9a7e',
      spices: '#a8703a',
      rugs: '#7d7f4f',
      jewelry: '#6e5a72',
    };
    for (const s of Object.values(SHOPS)) expect(theme.canopy[s.canopy].hex, s.id).toBe(hex[s.id]);
  });

  it('the open-stall picks exist', () => {
    for (const s of [...ALWAYS_OPEN, ...CHEAP_ONE_OF]) expect(SHOP_IDS).toContain(s);
  });
});

/** Every SPEC §7 row → the balance values it maps to (label, getter, expected). */
const SEVEN: [string, () => unknown, unknown][] = [
  ['Rounds per match', () => balance.match.rounds, 3],
  [
    'Round length',
    () => [balance.match.roundMs, ...balance.match.roundMsRange],
    [270_000, 180_000, 300_000],
  ],
  ['Players-only opening', () => balance.match.openingMs, 4000],
  ['Starting purse', () => balance.match.startPurse, 20],
  ['Pack capacity', () => balance.match.packCapacity, 15],
  ['Pawnbroker rate', () => [...balance.pawn.rate, balance.pawn.rerollMs], [0.45, 0.7, 45_000]],
  ['NPC sale rate', () => [...balance.npcSale.rate], [1.1, 1.5]],
  ['Luck skew exponent', () => balance.luck.skew, 2],
  ['NPC count tolerance', () => balance.npcs.tolerance, 0.08],
  ['Join hand-off delay', () => balance.join.handOffMs, 1500],
  ['Ambience one-shot interval', () => [...balance.ambience.oneShotMs], [2000, 6000]],
  ['Ambience duck', () => [balance.ambience.duckDb, balance.ambience.duckMs], [-8, 1000]],
  [
    'Grab time',
    () => [
      balance.grab.baseMs,
      balance.grab.perWeightMs,
      balance.grab.perValueMs,
      balance.grab.roundToMs,
    ],
    [500, 100, 2, 50],
  ],
  ['Back-shelf reach penalty', () => balance.grab.reachPenaltyMs, 500],
  ['Pickpocket hold', () => balance.pickpocket.holdMs, 2000],
  ['Pickpocket amount', () => [...balance.pickpocket.amount], [8, 20]],
  ['Tip-off fee', () => balance.tip.fee, 10],
  ['Wrong-grab penalty', () => balance.catch.wrongGrabPenalty, 12],
  ['Pot', () => balance.catch.potShare, 0.25],
  ["Tipper's share", () => balance.tip.share, 0.25],
  ['Hot-hands window', () => balance.catch.hotMs, 5000],
  ['Catch grace', () => balance.catch.graceMs, 300],
  ['Stocks time', () => balance.stocks.ms, 20_000],
  ['Post-stocks immunity', () => balance.stocks.immunityMs, 3000],
  ['Escape (out of sight)', () => balance.guards.escapeMs, 3000],
  ['Coin toss cost / cooldown', () => [balance.toss.cost, balance.toss.cooldownMs], [1, 8000]],
  ['NPCs', () => [balance.npcs.base, balance.npcs.perPlayer], [32 / 3, 8 / 3]],
  [
    'Open stalls',
    () => [balance.stalls.openExtra, balance.stalls.openMin, balance.stalls.openMax],
    [4, 6, 10],
  ],
  [
    'Starting guards',
    () => [
      [...balance.guards.start.large],
      [...balance.guards.start.small],
      balance.guards.start.largeFrom,
    ],
    [[1, 2, 3], [1, 1, 2], 5],
  ],
  ['Activations per extra guard', () => balance.guards.activationsPerGuard, 5],
  ['Guard cap', () => balance.guards.cap, 4],
  ['Guard alley speed', () => balance.guards.alleySpeed, 0.6],
  [
    '"Just browsing" suspicion',
    () => [balance.merchants.suspicion.glanceMult, balance.merchants.suspicion.decayMs],
    [2, 20_000],
  ],
  ['Merchant base glance interval', () => [...balance.merchants.glanceIntervalMs], [4000, 8000]],
  ['NPC pickpocket glance chance', () => balance.npcGlance.chance, 0.25],
  ['Rare stock', () => balance.stock.raresPerStall, 1],
  ['Uncommon restock', () => balance.stock.uncommonRestockMs, 60_000],
];

describe('balance', () => {
  it('every SPEC §7 row has a balance.ts key with its start value', () => {
    const section = spec.split('## 7. Balance sheet')[1]!.split('\n## ')[0]!;
    const rows = [...section.matchAll(/^\| ([^|]+?) \|[^|]+\|[^|]*\|$/gm)]
      .map((m) => m[1]!)
      .filter((l) => l !== 'Value' && !l.startsWith('---'));
    expect(SEVEN.map(([l]) => l)).toEqual(rows);
    for (const [label, get, want] of SEVEN) expect(get(), label).toEqual(want);
  });

  it('the outfit pool uses brand fabrics only', () => {
    for (const f of [...balance.outfit.tunics, ...balance.outfit.mantles])
      expect(theme.fabric[f]).toBeTruthy();
  });

  it('a jogging player is faster than any NPC gait (§6.10)', () => {
    const npcMax = balance.movement.brisk * balance.npcs.personality.speed[1];
    expect(balance.movement.jog).toBeGreaterThan(npcMax);
  });
});

describe('layout', () => {
  const inside = (p: { x: number; y: number }, r: { x: number; y: number; w: number; h: number }) =>
    p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;

  it('10 stall slots in two rows of five, in §6.3 order', () => {
    expect(LAYOUT.stalls).toHaveLength(10);
    expect(LAYOUT.stalls.map((s) => s.id)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(LAYOUT.stalls.map((s) => s.shop)).toEqual([...SHOP_IDS]);
    expect(LAYOUT.stalls.filter((s) => s.row === 'top')).toHaveLength(5);
    for (const s of LAYOUT.stalls.filter((s) => s.row === 'top')) {
      expect(s.footprint.y).toBe(0); // flush to the top edge
      expect(s.lane).toBe('upper');
    }
    for (const s of LAYOUT.stalls.filter((s) => s.row === 'middle')) expect(s.lane).toBe('lower');
  });

  it('two one-person alleys between middle stalls 2–3 and 3–4, and end passages', () => {
    expect(LAYOUT.alleys).toHaveLength(2);
    expect(LAYOUT.alleys.map((a) => a.between)).toEqual([
      [6, 7],
      [7, 8],
    ]);
    for (const a of LAYOUT.alleys) {
      const [l, r] = a.between.map((id) => LAYOUT.stalls[id]!.footprint);
      expect(a.rect.x).toBeCloseTo(l!.x + l!.w);
      expect(a.rect.x + a.rect.w).toBeCloseTo(r!.x);
      expect(a.rect.w).toBeLessThan(2 * 2 * balance.movement.bodyRadius + 0.6);
    }
    expect(LAYOUT.passages.map((p) => p.id)).toEqual(['left', 'right']);
  });

  it('four lane entries, at the lane ends', () => {
    expect(LAYOUT.entries.map((e) => e.id)).toEqual([
      'upperLeft',
      'upperRight',
      'lowerLeft',
      'lowerRight',
    ]);
    for (const e of LAYOUT.entries) {
      expect(inside(e.at, LAYOUT.lanes[e.lane].rect), e.id).toBe(true);
      expect(e.spawn.x < 0 || e.spawn.x > LAYOUT.size.w, e.id).toBe(true);
    }
  });

  it('the gate is in the top row beside the center stall', () => {
    const center = LAYOUT.stalls[2]!;
    expect(LAYOUT.gate.beside).toBe(2);
    expect(LAYOUT.gate.rect.y).toBe(0);
    expect(LAYOUT.gate.rect.x).toBeCloseTo(center.footprint.x + center.footprint.w, 0);
    expect(LAYOUT.gate.rect.x + LAYOUT.gate.rect.w).toBeLessThanOrEqual(
      LAYOUT.stalls[3]!.footprint.x,
    );
    expect(LAYOUT.gate.spawn.y).toBeLessThan(0);
  });

  it('the stocks sit lower-left with standing slots', () => {
    const s = LAYOUT.stocks;
    expect(s.rect.x + s.rect.w).toBeLessThan(LAYOUT.size.w / 4);
    expect(s.rect.y).toBeGreaterThan(LAYOUT.lanes.lower.rect.y);
    expect(s.slots.length).toBeGreaterThanOrEqual(2);
    for (const p of s.slots) expect(inside(p, s.rect)).toBe(true);
  });

  it('customer spots and the patrol loop are walkable', () => {
    const walk = LAYOUT.walkable.map((poly) => ({
      x: poly[0]!.x,
      y: poly[0]!.y,
      w: poly[2]!.x - poly[0]!.x,
      h: poly[2]!.y - poly[0]!.y,
    }));
    const ok = (p: { x: number; y: number }) => walk.some((r) => inside(p, r));
    for (const s of LAYOUT.stalls) {
      expect(ok({ x: s.customer.x0, y: s.customer.y }), `stall ${s.id}`).toBe(true);
      expect(ok(s.exit), `stall ${s.id} exit`).toBe(true);
    }
    for (const p of LAYOUT.patrol) expect(ok(p), JSON.stringify(p)).toBe(true);
    expect(LAYOUT.blockers).toHaveLength(12);
  });
});
