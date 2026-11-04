// Builds the world from `RunStart` and the step context the systems share (SPEC §15.3): entity
// creation and removal, the damage pipeline wiring, heals, effects, seeded streams.
import { rngStream, type Rng } from '@pcg/game-kit';
import type { StatId, TileKind } from '../../content/types';
import { SHOP_ITEM_IDS, type EnemyId, type ShopItemId, type StructureId } from '../../shared/ids';
import type { RunStats } from '../../shared/messages';
import { applyDamage, hpStage, reduceBy } from '../systems/damage';
import { applyEffect as applyEffectTo } from '../systems/effects';
import { buildField, IMPASSABLE } from '../systems/flowfield';
import { hookList } from '../systems/modifiers';
import type { Catalog } from './catalog';
import type { FireSpec, Rect, SimState, SlotInput, UnitKind } from './internal';
import { effects as effectDefs, modules } from './registry';
import { THREAT_COST, threatMap, type Attacker } from './ai/threat';
import { createSpatialHash } from './spatial';
import { attackStat, modifiersOf, statBlock, type Caps } from './stats';
import {
  BASE_ID,
  type AttackState,
  type BaseState,
  type DamageCalc,
  type DamageKind,
  type DamageResult,
  type EffectApply,
  type EnemyEnt,
  type EntityId,
  type FlowField,
  type HealResult,
  type PlayerEnt,
  type PlayerInput,
  type ProjectileEnt,
  type RunSlot,
  type RunStart,
  type SimEvent,
  type SoldierEnt,
  type StatBlock,
  type StructureEnt,
  type Unit,
  type World,
} from './types';

export function newAttack(): AttackState {
  return { readyAt: 0, queued: false, aim: { x: 0, y: 0 }, windupEndsAt: null };
}

export function zeroRunStats(): RunStats {
  return {
    damageDealt: 0,
    bossDamage: 0,
    kills: 0,
    damageTaken: 0,
    deaths: 0,
    healingDone: 0,
    cratesDelivered: 0,
    cratesGiven: 0,
    structuresBuilt: 0,
  };
}

export function neutralInput(): PlayerInput {
  return {
    move: { x: 0, y: 0 },
    mainAim: { x: 0, y: 0 },
    superAim: { x: 0, y: 0 },
    mainAiming: false,
    superAiming: false,
    radialOpen: false,
    radialSlot: -1,
    mainFires: 0,
    superFires: 0,
    actionTaps: 0,
    radialCommits: 0,
  };
}

/** Tiles enemies walk to: open neighbors of the Citadel (§15.5). */
function citadelGoals(cols: number, rows: number, kinds: readonly TileKind[]): number[] {
  const goals: number[] = [];
  for (let t = 0; t < kinds.length; t++) {
    if (kinds[t] === 'citadel' || kinds[t] === 'blocked') continue;
    const c = t % cols;
    const r = (t - c) / cols;
    const near =
      (r > 0 && kinds[t - cols] === 'citadel') ||
      (r < rows - 1 && kinds[t + cols] === 'citadel') ||
      (c > 0 && kinds[t - 1] === 'citadel') ||
      (c < cols - 1 && kinds[t + 1] === 'citadel');
    if (near) goals.push(t);
  }
  return goals;
}

export interface StateExtras {
  /** Base stat blocks by unit (recomputed into `stats` with mods and effects). */
  readonly baseStats: Map<EntityId, StatBlock>;
  readonly caps: Caps;
  readonly goals: readonly number[];
  readonly rebuildFields: () => void;
  readonly removeUnit: (id: EntityId) => void;
  readonly respawnPoint: (slot: number) => { x: number; y: number };
  /** A Commander's soldier (his class's `squad.soldier` stats); `index` defaults to the next free. */
  readonly addSoldier: (owner: number, x: number, y: number, index?: number) => SoldierEnt;
  readonly isBlocker: (kind: StructureId) => boolean;
}

export type FullState = SimState & StateExtras;

export function createState(start: RunStart, cat: Catalog): FullState {
  const { map, rules, difficulty } = cat;
  const cols = map.cols;
  const rows = map.rows;
  const kinds: TileKind[] = [];
  let bx0 = Infinity;
  let by0 = Infinity;
  let bx1 = -Infinity;
  let by1 = -Infinity;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const k = map.legend[map.tiles[r]![c]!] ?? 'blocked';
      kinds.push(k);
      if (k === 'citadel') {
        bx0 = Math.min(bx0, c);
        by0 = Math.min(by0, r);
        bx1 = Math.max(bx1, c + 1);
        by1 = Math.max(by1, r + 1);
      }
    }
  }
  const baseRect: Rect = { x0: bx0, y0: by0, x1: bx1, y1: by1 };
  const goals = citadelGoals(cols, rows, kinds);
  const caps = rules.statCaps as Caps;
  const occupant = new Int32Array(cols * rows);

  const units = new Map<EntityId, Unit>();
  const unitKinds = new Map<EntityId, UnitKind>();
  const baseStats = new Map<EntityId, StatBlock>();
  const killers = new Map<EntityId, EntityId | null>();
  const inputs = new Map<number, SlotInput>();
  const streams = new Map<string, Rng>();

  const baseHp = cat.base.hp * difficulty.baseHp;
  const base: BaseState = {
    id: BASE_ID,
    x: (bx0 + bx1) / 2,
    y: (by0 + by1) / 2,
    vx: 0,
    vy: 0,
    r: Math.min(bx1 - bx0, by1 - by0) / 2,
    hp: baseHp,
    maxHp: baseHp,
    facing: Math.PI / 2,
    mods: [],
    effects: [],
    stats: statBlock({ maxHp: baseHp }),
    push: null,
    repairs: 0,
    alarm: false,
    archers: {
      count: cat.base.archers.count,
      attack: Array.from({ length: cat.base.archers.count }, newAttack),
      aim: Array.from({ length: cat.base.archers.count }, () => Math.PI / 2),
    },
    stage: 0,
  };
  units.set(BASE_ID, base);
  unitKinds.set(BASE_ID, 'base');
  baseStats.set(BASE_ID, statBlock({ maxHp: baseHp }));

  const shop = {} as Record<ShopItemId, number>;
  for (const id of SHOP_ITEM_IDS) shop[id] = 0;

  const emptyField = (): FlowField => ({
    cols,
    rows,
    dist: new Float32Array(cols * rows),
    next: new Int16Array(cols * rows),
  });

  const world: World = {
    tick: 0,
    phase: 'countdown',
    wave: 1,
    phaseEndsAt: cat.steps(rules.countdownMs),
    seed: start.seed,
    settings: { ...start.settings },
    nextId: BASE_ID + 1,
    players: [],
    soldiers: [],
    enemies: [],
    structures: [],
    projectiles: [],
    cratePiles: [],
    thrown: [],
    markers: [],
    spawns: [],
    grid: { cols, rows, kinds, occupant },
    fields: { ground: emptyField(), breaker: emptyField(), hunted: [], dirty: true },
    spatial: createSpatialHash(cols, rows),
    base,
    team: {
      coins: rules.startCoins,
      shop,
      wishlist: [],
      scaling: { players: 0, mult: 1, flyers: false },
    },
    events: [],
  };

  const isBlocker = (kind: StructureId) => cat.structure(kind).pathCost > 1;
  const tileCost = (breaker: boolean) => (t: number) => {
    const k = kinds[t];
    if (k === 'citadel' || k === 'blocked') return IMPASSABLE;
    const occ = occupant[t]!;
    if (occ === 0) return 1;
    const st = units.get(occ) as StructureEnt | undefined;
    if (!st) return 1;
    if (breaker && st.kind === 'wall') return rules.breakerWallCost;
    return cat.structure(st.kind).pathCost;
  };
  const groundCost = tileCost(false);
  const breakerCost = tileCost(true);
  // Tower threat for the Hunters' fields (C3, FF10-fix-1): ground cost plus a cost per attacker
  // whose range covers the tile (ai/threat.ts).
  const threat = new Float32Array(cols * rows);
  const huntCost = (t: number) => {
    const g = groundCost(t);
    return g === IMPASSABLE ? g : g + threat[t]! * THREAT_COST;
  };
  const computeThreat = () => {
    const out: Attacker[] = [];
    for (const st of world.structures) {
      const atk = cat.structure(st.kind).attack;
      if (!atk || (st.damageable && st.hp <= 0)) continue;
      out.push({
        x: st.x,
        y: st.y,
        range: attackStat(st, atk.range, 'range', undefined, effectDefs, caps),
      });
    }
    const b = world.base;
    const sentries = cat.base.archers;
    if (b.hp > 0) {
      const range = attackStat(b, sentries.attack.range, 'range', undefined, effectDefs, caps);
      for (let i = 0; i < b.archers.count; i++) {
        const at = sentries.at[i];
        if (at) out.push({ x: at.x, y: at.y, range });
      }
    }
    threatMap(cols, rows, out, threat);
  };
  // 8-neighbor fields that never cut a blocker's corner (C3: direct diagonals to the Citadel).
  const solid = (t: number) => {
    const k = kinds[t];
    if (k === 'citadel' || k === 'blocked') return true;
    const occ = occupant[t]!;
    if (occ === 0) return false;
    const st = units.get(occ) as StructureEnt | undefined;
    return st !== undefined && isBlocker(st.kind);
  };
  const fieldOpts = { diagonal: true, solid };
  /** The tile each hunted field was built toward (−1 = stale), by slot. */
  const huntedAt: number[] = [];
  const rebuildFields = () => {
    buildField(world.grid, groundCost, goals, world.fields.ground, fieldOpts);
    buildField(world.grid, breakerCost, goals, world.fields.breaker, fieldOpts);
    computeThreat();
    huntedAt.fill(-1);
    world.fields.dirty = false;
  };

  const respawnPoint = (slot: number) => {
    const pts = rules.respawn;
    return { ...pts[((slot % pts.length) + pts.length) % pts.length]! };
  };

  const register = (u: Unit, kind: UnitKind, stats: StatBlock) => {
    units.set(u.id, u);
    unitKinds.set(u.id, kind);
    baseStats.set(u.id, stats);
  };

  function addPlayer(slot: RunSlot) {
    const def = cat.character(slot.classId);
    const at = respawnPoint(slot.slot);
    const stats = statBlock({
      maxHp: def.hp,
      moveSpeed: def.moveSpeed,
      respawnMs: rules.respawnMs,
      superCharge: def.superChargeRate,
      radius: def.radius,
      attackSpeed: 1,
      carrySlowdown: 1,
      // Supply perks (Quartermaster, FF9): stats, so cards can change them.
      crateDiscount: def.supply?.crateDiscount ?? 0,
      throwRange: def.supply?.throwRange ?? 0,
      throwSpeed: def.supply?.throwSpeed ?? 0,
    });
    const passive = modules[def.passive.module];
    const p: PlayerEnt = {
      id: world.nextId++,
      x: at.x,
      y: at.y,
      vx: 0,
      vy: 0,
      r: def.radius,
      hp: def.hp,
      maxHp: def.hp,
      facing: Math.PI / 2,
      mods: passive ? [passive.make(def.passive.params ?? {})] : [],
      effects: [],
      stats: { ...stats },
      push: null,
      slot: slot.slot,
      classId: slot.classId,
      name: slot.name,
      color: slot.color,
      connected: slot.connected,
      respawnAt: null,
      crates: 0,
      kits: 0,
      superCharge: 0,
      main: newAttack(),
      super: newAttack(),
      mainAim: null,
      superAim: null,
      radialOpen: false,
      radialSlot: -1,
      stillTicks: 0,
      lastBuilt: null,
      ghost: null,
      flag: null,
      cards: {},
      offer: null,
      picked: null,
      ready: false,
      invincible: false,
      run: zeroRunStats(),
    };
    world.players.push(p);
    register(p, 'player', stats);
    inputs.set(p.slot, {
      input: neutralInput(),
      main: false,
      super: false,
      action: false,
      radial: false,
      prev: { mainFires: 0, superFires: 0, actionTaps: 0, radialCommits: 0 },
      baseline: true,
    });
  }

  for (const slot of [...start.slots].sort((a, b) => a.slot - b.slot)) addPlayer(slot);

  const ctx: FullState = {
    world,
    cat,
    units,
    kinds: unitKinds,
    killers,
    inputs,
    baseRect,
    scratch: [],
    baseStats,
    caps,
    goals,
    rebuildFields,
    respawnPoint,
    isBlocker,
    tick: () => world.tick,
    rng(label) {
      let r = streams.get(label);
      if (!r) {
        r = rngStream(world.seed, label);
        streams.set(label, r);
      }
      return r;
    },
    emit(event: SimEvent) {
      world.events.push(event);
    },
    unit: (id) => units.get(id) ?? null,
    modifiers: (u) => modifiersOf(u, effectDefs),
    hooks: (u, key) => hookList([modifiersOf(u, effectDefs)], key),
    attackStat: (u, b, stat: StatId, scope) => attackStat(u, b, stat, scope, effectDefs, caps),
    player: (slot) => world.players.find((p) => p.slot === slot),
    targetable: (p) => p.respawnAt === null && p.connected && p.hp > 0,
    nearestEnemy(x, y, range, hitsFlyers) {
      // A straight scan (the array is in id order, so ties go to the lower id): attack ranges cover
      // dozens of hash cells, and the scan was several times cheaper in the bench (BUILD_PLAN §8).
      let best: EnemyEnt | null = null;
      let bestD = Infinity;
      for (const e of world.enemies) {
        if (e.hp <= 0 || (e.flying && !hitsFlyers)) continue;
        const dx = e.x - x;
        const dy = e.y - y;
        const d = Math.sqrt(dx * dx + dy * dy) - e.r;
        if (d <= range && d < bestD) {
          best = e;
          bestD = d;
        }
      }
      return best;
    },
    fire(spec: FireSpec) {
      const perStep = spec.speed / 60;
      const p: ProjectileEnt = {
        id: world.nextId++,
        x: spec.x,
        y: spec.y,
        vx: spec.dx * spec.speed,
        vy: spec.dy * spec.speed,
        r: 0.12,
        side: spec.side,
        source: spec.source.id,
        from: spec.from,
        slot: spec.slot,
        damage: spec.damage,
        kind: spec.kind,
        tags: spec.tags,
        effects: spec.effects,
        hitsFlyers: spec.attack.hitsFlyers,
        blockedBy: spec.attack.blockedBy ?? [],
        pierce: spec.pierce,
        hit: [],
        expiresAt: world.tick + Math.max(1, Math.ceil(spec.range / perStep)),
        arc: null,
      };
      world.projectiles.push(p);
      return p;
    },
    tileKind(col, row) {
      if (col < 0 || row < 0 || col >= cols || row >= rows) return null;
      return kinds[row * cols + col]!;
    },
    classOf: (p) => p.classId,
    spawnEnemy(kind: EnemyId, x, y, lane, group) {
      const def = cat.enemy(kind);
      const hp = def.hp * difficulty.enemyHp;
      const stats = statBlock({
        maxHp: hp,
        moveSpeed: def.speed,
        damage: def.attack.damage * difficulty.enemyDamage,
        range: def.attack.range,
        attackSpeed: 1,
        radius: def.radius,
      });
      const id = world.nextId++;
      const e: EnemyEnt = {
        id,
        x,
        y,
        vx: 0,
        vy: 0,
        r: def.radius,
        hp,
        maxHp: hp,
        facing: -Math.PI / 2,
        mods: [],
        effects: [],
        stats: { ...stats },
        push: null,
        kind,
        flying: def.flying,
        lane,
        group: group ?? id,
        ai: 'path',
        target: null,
        leashFrom: null,
        hunting: null,
        attack: newAttack(),
      };
      if (def.flying) e.z = 1;
      world.enemies.push(e);
      register(e, 'enemy', stats);
      ctx.emit({ e: 'spawn', id, enemy: kind, lane });
      return e;
    },
    placeStructure(kind: StructureId, col, row, owner) {
      const def = cat.structure(kind);
      const hp = def.hp ?? 1;
      const stats = statBlock({ maxHp: hp, attackSpeed: 1, range: def.attack?.range ?? 0 });
      const st: StructureEnt = {
        id: world.nextId++,
        x: col + 0.5,
        y: row + 0.5,
        vx: 0,
        vy: 0,
        r: 0.5,
        hp,
        maxHp: hp,
        facing: Math.PI / 2,
        mods: [],
        effects: [],
        stats: { ...stats },
        push: null,
        kind,
        tile: [col, row],
        owner,
        damageable: def.hp !== null,
        discharges: def.discharges ?? null,
        rearmAt: null,
        fortified: false,
        attack: def.attack ? newAttack() : null,
        mask: 0,
      };
      world.structures.push(st);
      register(st, 'structure', stats);
      occupant[row * cols + col] = st.id;
      updateMasks(col, row);
      if (isBlocker(kind)) world.fields.dirty = true;
      return st;
    },
    fieldsDirty() {
      world.fields.dirty = true;
    },
    huntField(slot) {
      const p = world.players.find((q) => q.slot === slot);
      if (!p) return null;
      const col = Math.min(cols - 1, Math.max(0, Math.floor(p.x)));
      const row = Math.min(rows - 1, Math.max(0, Math.floor(p.y)));
      const t = row * cols + col;
      const hunted = world.fields.hunted;
      while (hunted.length <= slot) hunted.push(null);
      while (huntedAt.length <= slot) huntedAt.push(-1);
      const f = hunted[slot] ?? undefined;
      if (f && huntedAt[slot] === t) return f;
      hunted[slot] = buildField(world.grid, huntCost, [t], f, fieldOpts);
      huntedAt[slot] = t;
      return hunted[slot];
    },
    addSoldier(owner, x, y, index) {
      const lead = world.players.find((p) => p.slot === owner);
      const def = lead ? cat.character(lead.classId).squad?.soldier : undefined;
      const hp = def?.hp ?? 100;
      const r = def?.radius ?? 0.28;
      const stats = statBlock({
        maxHp: hp,
        moveSpeed: def?.moveSpeed ?? 3,
        radius: r,
        attackSpeed: 1,
      });
      const s: SoldierEnt = {
        id: world.nextId++,
        x,
        y,
        vx: 0,
        vy: 0,
        r,
        hp,
        maxHp: hp,
        facing: Math.PI / 2,
        mods: [],
        effects: [],
        stats: { ...stats },
        push: null,
        owner,
        index: index ?? world.soldiers.filter((x) => x.owner === owner).length,
        veterans: 0,
        mode: 'follow',
        target: null,
        attack: newAttack(),
      };
      world.soldiers.push(s);
      register(s, 'soldier', stats);
      return s;
    },
    removeUnit(id) {
      const u = units.get(id);
      units.delete(id);
      unitKinds.delete(id);
      baseStats.delete(id);
      killers.delete(id);
      if (u && 'tile' in u) {
        const st = u as StructureEnt;
        const [c, r] = st.tile;
        if (occupant[r * cols + c] === id) occupant[r * cols + c] = 0;
        updateMasks(c, r);
        if (isBlocker(st.kind)) world.fields.dirty = true;
      }
    },
    damage(calc: DamageCalc): DamageResult {
      const target = units.get(calc.target);
      if (!target || target.hp <= 0) {
        return { ...calc, amount: 0, absorbed: 0, dealt: 0, killed: false };
      }
      const src = calc.source === null ? null : (units.get(calc.source) ?? null);
      const tkind = unitKinds.get(target.id);
      // Melee can't reach a Flyer (§9): hammers, blades and fists swing under it.
      if (calc.kind === 'melee' && tkind === 'enemy' && (target as EnemyEnt).flying) {
        return { ...calc, amount: 0, absorbed: 0, dealt: 0, killed: false };
      }
      return applyDamage<EntityId, DamageKind>(calc, {
        outgoing: src
          ? (c) => {
              for (const f of ctx.hooks(src, 'modifyOutgoing')) f(ctx, src, c as DamageCalc);
            }
          : undefined,
        incoming: (c) => {
          for (const f of ctx.hooks(target, 'modifyIncoming')) f(ctx, target, c as DamageCalc);
          const dr = target.stats.damageReduction;
          if (dr > 0) c.amount = reduceBy(c.amount, dr);
        },
        takeHp: (c, amount) =>
          tkind === 'player' && (target as PlayerEnt).invincible
            ? { dealt: 0, killed: false }
            : hpStage(target)(c, amount),
        after: (r) => afterDamage(r as DamageResult, src, target, tkind),
      }) as DamageResult;
    },
    heal(targetId, amount, source): HealResult {
      const u = units.get(targetId);
      if (!u || u.hp <= 0 || amount <= 0) {
        return { source, target: targetId, amount, healed: 0, overflow: Math.max(0, amount) };
      }
      const healed = Math.min(amount, u.maxHp - u.hp);
      u.hp += healed;
      const h: HealResult = { source, target: targetId, amount, healed, overflow: amount - healed };
      if (healed > 0) ctx.emit({ e: 'heal', source, target: targetId, amount: healed });
      const src = source === null ? null : units.get(source);
      if (src) {
        if (unitKinds.get(src.id) === 'player') (src as PlayerEnt).run.healingDone += healed;
        for (const f of ctx.hooks(src, 'onHeal')) f(ctx, src, h);
      }
      return h;
    },
    applyEffect(targetId, effect: EffectApply, source) {
      const u = units.get(targetId);
      const def = effectDefs[effect.effect];
      if (!u || !def) return false;
      let strength = effect.strength;
      // Brutes and the Colossus take slows at half strength (§7.1, `slowResist`).
      if (effect.effect === 'slow' && unitKinds.get(targetId) === 'enemy')
        strength *= 1 - (cat.enemy((u as EnemyEnt).kind).slowResist ?? 0);
      const ev = { ...effect, strength, source, target: targetId };
      for (const f of ctx.hooks(u, 'beforeEffect')) if (!f(ctx, u, ev)) return false;
      applyEffectTo(
        u.effects,
        {
          stacking: def.stacking,
          maxStacks: def.maxStacks,
          tickEvery: def.tickEveryMs ? cat.steps(def.tickEveryMs) : undefined,
        },
        {
          def: effect.effect,
          strength: ev.strength,
          duration: cat.steps(effect.durationMs),
          source,
        },
      );
      return true;
    },
  };

  function afterDamage(
    r: DamageResult,
    src: Unit | null,
    target: Unit,
    tkind: UnitKind | undefined,
  ) {
    ctx.emit({
      e: 'damage',
      source: r.source,
      target: r.target,
      amount: r.dealt,
      kind: r.kind,
      killed: r.killed,
    });
    if (r.killed) killers.set(target.id, r.source);
    if (src && unitKinds.get(src.id) === 'player') {
      const p = src as PlayerEnt;
      p.run.damageDealt += r.dealt;
      // A super's own damage doesn't charge the super (BUILD_PLAN §8, FF6).
      if (p.superCharge < 1 && !r.tags.includes('super')) {
        p.superCharge = Math.min(1, p.superCharge + r.dealt * p.stats.superCharge);
        if (p.superCharge >= 1) ctx.emit({ e: 'superReady', slot: p.slot });
      }
    }
    if (tkind === 'player') (target as PlayerEnt).run.damageTaken += r.dealt;
    if (tkind === 'base' && r.dealt > 0) ctx.emit({ e: 'baseHit', amount: r.dealt, hp: target.hp });
    if (src) for (const f of ctx.hooks(src, 'onDamageDealt')) f(ctx, src, r);
    for (const f of ctx.hooks(target, 'onDamageTaken')) f(ctx, target, r);
  }

  /** Same-type neighbor masks (N1 E2 S4 W8) for walls and snares around (col, row). */
  function updateMasks(col: number, row: number) {
    const at = (c: number, r: number) => {
      if (c < 0 || r < 0 || c >= cols || r >= rows) return null;
      const id = occupant[r * cols + c]!;
      return id === 0 ? null : (units.get(id) as StructureEnt | undefined);
    };
    for (const [c, r] of [
      [col, row],
      [col, row - 1],
      [col + 1, row],
      [col, row + 1],
      [col - 1, row],
    ] as const) {
      const st = at(c, r);
      if (!st) continue;
      const same = (dc: number, dr: number) => at(c + dc, r + dr)?.kind === st.kind;
      st.mask =
        (same(0, -1) ? 1 : 0) | (same(1, 0) ? 2 : 0) | (same(0, 1) ? 4 : 0) | (same(-1, 0) ? 8 : 0);
    }
  }

  rebuildFields();
  return ctx;
}
