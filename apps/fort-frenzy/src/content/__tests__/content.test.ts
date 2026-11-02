// Content validation (SPEC §15.4): every referenced id exists, structure costs fit the carry cap, build
// lists fit the build arc, wave budgets cover their guaranteed spawns, and the map is well formed.
import { describe, expect, it } from 'vitest';
import { modules } from '../../host/sim/registry';
import { aiKinds, structureBehaviors } from '../../host/sim/registry';
import {
  CARD_IDS,
  CLASS_IDS,
  DIFFICULTY_IDS,
  ENEMY_IDS,
  LANE_IDS,
  SHOP_ITEM_IDS,
  STRUCTURE_IDS,
} from '../../shared/ids';
import { content } from '../index';
import type { UpgradeTarget } from '../types';

const c = content;
const enemyIds = new Set(c.enemies.map((e) => e.id));
const structureIds = new Set(c.structures.map((s) => s.id));
const cardIds = new Set(c.cards.map((x) => x.id));
const classIds = new Set(c.characters.map((x) => x.id));

function unique(ids: string[]) {
  expect(new Set(ids).size).toBe(ids.length);
}

describe('content ids', () => {
  it('every def uses a known id, once', () => {
    for (const x of c.characters) expect(CLASS_IDS).toContain(x.id);
    for (const x of c.enemies) expect(ENEMY_IDS).toContain(x.id);
    for (const x of c.structures) expect(STRUCTURE_IDS).toContain(x.id);
    for (const x of c.cards) expect(CARD_IDS).toContain(x.id);
    for (const x of c.shop) expect(SHOP_ITEM_IDS).toContain(x.id);
    for (const x of c.difficulties) expect(DIFFICULTY_IDS).toContain(x.id);
    unique(c.characters.map((x) => x.id));
    unique(c.enemies.map((x) => x.id));
    unique(c.structures.map((x) => x.id));
    unique(c.cards.map((x) => x.id));
    unique(c.shop.map((x) => x.id));
    unique(c.difficulties.map((x) => x.id));
    expect(c.difficulties.map((d) => d.id)).toContain('normal');
  });

  it('characters reference existing structures and modules', () => {
    for (const ch of c.characters) {
      for (const s of ch.build) expect(structureIds).toContain(s);
      expect(Object.keys(modules)).toContain(ch.passive.module);
    }
  });

  it('cards: combo prerequisites, favored enemies, classes and modules exist', () => {
    for (const card of c.cards) {
      for (const r of card.requires ?? []) expect(cardIds).toContain(r);
      if (card.favoredEnemy) expect(enemyIds).toContain(card.favoredEnemy);
      if (card.requiresClass) expect(classIds).toContain(card.requiresClass);
      if (card.module) expect(Object.keys(modules)).toContain(card.module.module);
      if (card.owner !== 'common') expect(classIds).toContain(card.owner);
    }
  });

  it('enemies have an AI and boss modules exist; structures with attacks have a behavior', () => {
    for (const e of c.enemies) {
      expect(Object.keys(aiKinds)).toContain(e.ai);
      if (e.boss) expect(Object.keys(modules)).toContain(e.boss.module);
    }
    for (const s of c.structures) {
      if (s.attack) expect(Object.keys(structureBehaviors)).toContain(s.id);
    }
  });

  it('shop targets exist', () => {
    const targets = new Set<UpgradeTarget>(['base', 'archers', 'squad', 'towers', ...structureIds]);
    for (const item of c.shop) {
      expect(item.tiers.length).toBeGreaterThan(0);
      for (const t of item.tiers) {
        if (t.effect.kind === 'stats' || t.effect.kind === 'module')
          expect(targets).toContain(t.effect.target);
        if (t.effect.kind === 'module') expect(Object.keys(modules)).toContain(t.effect.module.module);
      }
    }
    expect(c.shop.map((s) => s.id)).toContain('crate');
  });

  it('waves: pools, guaranteed spawns and lanes exist; budgets cover the guaranteed spawns', () => {
    expect(c.waves.map((w) => w.n)).toEqual(c.waves.map((_, i) => i + 1));
    for (const w of c.waves) {
      for (const id of w.allowed) expect(enemyIds).toContain(id);
      expect(w.lanes.length).toBeGreaterThan(0);
      for (const l of w.lanes) expect(LANE_IDS).toContain(l);
      let cost = 0;
      for (const g of w.guaranteed) {
        expect(enemyIds).toContain(g.enemy);
        if (g.lane) expect(LANE_IDS).toContain(g.lane);
        cost += g.count * c.enemies.find((e) => e.id === g.enemy)!.budget;
      }
      expect(w.budget).toBeGreaterThanOrEqual(cost);
      if (w.boss) expect(enemyIds).toContain(w.boss.id);
    }
  });
});

describe('content rules', () => {
  it('no structure costs more than a non-Quartermaster can carry', () => {
    const maxCost = Math.max(...c.structures.map((s) => s.cost));
    for (const ch of c.characters) {
      if (ch.id === 'quartermaster') continue;
      expect(ch.carryCap).toBeGreaterThanOrEqual(maxCost);
    }
  });

  it('every build list fits the build arc (at most 3)', () => {
    for (const ch of c.characters) expect(ch.build.length).toBeLessThanOrEqual(3);
  });

  it('carry slowdown has an entry per crate up to the cap and only grows', () => {
    for (const ch of c.characters) {
      expect(ch.carrySlowdown).toHaveLength(ch.carryCap + 1);
      expect(ch.carrySlowdown[0]).toBe(0);
      for (let i = 1; i < ch.carrySlowdown.length; i++) {
        expect(ch.carrySlowdown[i]).toBeGreaterThanOrEqual(ch.carrySlowdown[i - 1]!);
        expect(ch.carrySlowdown[i]).toBeLessThan(1);
      }
    }
  });

  it('the map is well formed: size, legend, lane entries on lane tiles, a Citadel', () => {
    const m = c.map!;
    expect(m.tiles).toHaveLength(m.rows);
    for (const row of m.tiles) {
      expect(row).toHaveLength(m.cols);
      for (const ch of row) expect(Object.keys(m.legend)).toContain(ch);
    }
    const kind = (col: number, row: number) => m.legend[m.tiles[row]![col]!];
    for (const lane of LANE_IDS) {
      expect(m.lanes[lane].entry.length).toBeGreaterThan(0);
      for (const [col, row] of m.lanes[lane].entry) expect(kind(col, row)).toBe('lane');
    }
    expect(m.tiles.join('')).toContain('C');
    expect(m.tiles.join('')).toContain('R');
    expect(m.tiles.join('')).toContain('A');
  });

  it('the base, rules and scaling are present and sane', () => {
    expect(c.base!.hp).toBeGreaterThan(0);
    expect(c.base!.archers.at.length).toBeGreaterThanOrEqual(c.base!.archers.count);
    expect(c.rules!.respawn.length).toBeGreaterThanOrEqual(6);
    expect(c.rules!.buildCapMs).toBe(45_000);
    expect(c.rules!.inputStaleMs).toBe(250);
    expect(c.scaling).toEqual({ base: 0.5, perPlayer: 0.25 });
  });
});
