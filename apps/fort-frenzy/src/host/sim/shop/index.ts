// The team shop in the run (SPEC §3.4, §3.5, §6.2, §10.3): any player buys any item they can see
// from the team's coins in the build phase; prices rise per tier; building upgrades apply to every
// structure of that type (later ones too) as `shop:<item>` modifiers; items are shown only when the
// team can use them (and Quartermaster-only ones only to Quartermasters); every purchase is announced
// (`purchase` event; crates are personal and aren't); the wishlist takes requests and clears an item
// when it's bought, and everything at the wave start.
// The row helpers are pure on (content, world), so phone views use the same rules as the sim.
import type { Content } from '../../../content';
import { HOLD_CONFIRM_PRICE } from '../../../content/shop';
import type { Condition, ShopItemDef, StatMod, UpgradeTarget, WaveDef } from '../../../content/types';
import type { ClassId, ShopItemId, StructureId } from '../../../shared/ids';
import type { AckReason } from '../../../shared/messages';
import { buyCrate } from '../crates';
import type { FullState } from '../state';
import { effects as effectDefs, modules } from '../registry';
import { refreshStats } from '../stats';
import type { Modifier, PlayerEnt, StructureEnt, TeamState, Unit, World } from '../types';

const TOWERS: readonly StructureId[] = ['arrow_tower', 'bomb_tower'];

// ---- visibility and prices (pure) ---------------------------------------------------------------

export function conditionMet(cond: Condition | undefined, world: World): boolean {
  if (!cond) return true;
  if ('teamHasAny' in cond) return world.players.some((p) => cond.teamHasAny.includes(p.classId));
  return world.wave >= cond.waveAtLeast;
}

/** Regular (non-boss) waves before wave `wave`. */
export function regularWavesBefore(waves: readonly WaveDef[], wave: number): number {
  return waves.filter((w) => w.n < wave && w.boss === undefined).length;
}

/** Was the wave before `wave` a regular one (squad stats are sold after those, §6.2)? */
export function afterRegularWave(waves: readonly WaveDef[], wave: number): boolean {
  const prev = waves.find((w) => w.n === wave - 1);
  return prev !== undefined && prev.boss === undefined;
}

export interface ShopItemState {
  /** Tiers owned; for repeatable items, purchases made. */
  tier: number;
  /** 0 for repeatable items. */
  maxTier: number;
  /** The next purchase's price; null = sold out. */
  price: number | null;
  /** The team can use it now (§6.2). */
  visible: boolean;
  holdToConfirm: boolean;
}

/** One item's tier, next price and visibility for this team now. */
export function itemState(content: Content, world: World, def: ShopItemDef): ShopItemState {
  const owned = world.team.shop[def.id] ?? 0;
  const waves = content.waves;
  let next: ShopItemDef['tiers'][number] | undefined;
  if (def.id === 'repair') next = def.tiers[Math.min(world.base.repairs, def.tiers.length - 1)];
  else if (def.repeatable) next = def.tiers[0];
  else next = def.tiers[owned];
  let visible = conditionMet(def.visibleIf, world);
  // Squad stats: one tier per regular wave cleared, sold only right after a regular wave.
  if (def.afterRegularWaveOnly) {
    visible &&= afterRegularWave(waves, world.wave) && owned < regularWavesBefore(waves, world.wave);
  }
  const price = next ? next.price : null;
  return {
    tier: owned,
    maxTier: def.repeatable ? 0 : def.tiers.length,
    price,
    visible,
    holdToConfirm: def.holdToConfirm ?? (price !== null && price >= HOLD_CONFIRM_PRICE),
  };
}

/** Can a player of `classId` see this item (Quartermaster-only items, §6.2, §10.3)? */
export function shownTo(def: ShopItemDef, classId: ClassId | null): boolean {
  return !def.qmOnly || classId === 'quartermaster';
}

// ---- shop modifiers on units --------------------------------------------------------------------

function targetsOf(kind: 'structure' | 'soldier' | 'base', structure?: StructureId): UpgradeTarget[] {
  if (kind === 'soldier') return ['squad'];
  if (kind === 'base') return ['base', 'archers'];
  const out: UpgradeTarget[] = [structure!];
  if (TOWERS.includes(structure!)) out.push('towers');
  return out;
}

/** The `shop:<item>` modifiers a unit gets from the tiers the team owns. */
export function shopModifiers(content: Content, team: TeamState, targets: readonly UpgradeTarget[]): Modifier[] {
  const out: Modifier[] = [];
  for (const def of content.shop) {
    const owned = Math.min(team.shop[def.id] ?? 0, def.tiers.length);
    if (owned <= 0 || def.repeatable) continue;
    const stats: StatMod[] = [];
    let mod: Modifier | null = null;
    for (const t of def.tiers.slice(0, owned)) {
      const fx = t.effect;
      if (fx.kind === 'stats' && targets.includes(fx.target)) stats.push(...fx.stats);
      if (fx.kind === 'module' && targets.includes(fx.target))
        mod = modules[fx.module.module]?.make(fx.module.params ?? {}) ?? null;
    }
    if (stats.length === 0 && !mod) continue;
    const m: Modifier = mod ?? { id: '' };
    m.id = `shop:${def.id}`;
    if (stats.length > 0) m.stats = [...(m.stats ?? []), ...stats];
    out.push(m);
  }
  return out;
}

/** Extra discharges every net has from Snare charges tiers (§7.1). */
export function extraDischarges(content: Content, team: TeamState): number {
  let n = 0;
  for (const def of content.shop) {
    const owned = Math.min(team.shop[def.id] ?? 0, def.tiers.length);
    for (const t of def.tiers.slice(0, owned)) if (t.effect.kind === 'discharges') n += t.effect.add;
  }
  return n;
}

/** Puts the current `shop:*` modifiers on a unit; a higher max HP comes in full. */
function refit(s: FullState, u: Unit, targets: readonly UpgradeTarget[]) {
  const keep = u.mods.filter((m) => !m.id.startsWith('shop:'));
  u.mods.length = 0;
  u.mods.push(...keep, ...shopModifiers(s.cat.content, s.world.team, targets));
  const before = u.maxHp;
  refreshStats(u, s.baseStats.get(u.id)!, effectDefs, s.caps);
  if (u.hp > 0 && u.maxHp > before) u.hp += u.maxHp - before;
}

/** A new structure gets the team's upgrades (and a new net the extra discharges). */
export function fitStructure(s: FullState, st: StructureEnt): void {
  refit(s, st, targetsOf('structure', st.kind));
  if (st.discharges !== null) st.discharges += extraDischarges(s.cat.content, s.world.team);
}

/** A new soldier gets the squad upgrades. */
export function fitSoldier(s: FullState, u: Unit): void {
  refit(s, u, targetsOf('soldier'));
}

// ---- purchases and requests ---------------------------------------------------------------------

function dropWish(world: World, item: ShopItemId) {
  world.team.wishlist = world.team.wishlist.filter((x) => x.item !== item);
}

/** Wave start: the wishlist empties (§6.2). */
export function clearWishlist(world: World): void {
  world.team.wishlist = [];
}

/** The `buy` command (§6.2): build phase, any player, from the team's coins. */
export function buy(s: FullState, p: PlayerEnt, item: ShopItemId): AckReason | null {
  const w = s.world;
  const def = s.cat.shopItem(item);
  if (!def) return 'invalid';
  if (w.phase !== 'build') return 'phase';
  if (!shownTo(def, p.classId)) return 'invalid';
  const st = itemState(s.cat.content, w, def);
  if (!st.visible || st.price === null) return 'invalid';
  const tier = def.id === 'repair' ? def.tiers[Math.min(w.base.repairs, def.tiers.length - 1)]! : def.repeatable ? def.tiers[0]! : def.tiers[st.tier]!;
  const fx = tier.effect;
  if (fx.kind === 'crates') {
    // Crates (§6): the depot's price and rules, into the buyer's inventory; personal, so no announcement.
    const why = buyCrate(s, p);
    if (why === null) dropWish(w, item);
    return why;
  }
  if (fx.kind === 'kit' && p.kits >= 1) return 'cap';
  if (fx.kind === 'repair' && w.base.hp >= w.base.maxHp) return 'invalid';
  if (fx.kind === 'archers' && w.base.archers.count >= s.cat.base.archers.at.length) return 'invalid';
  if (w.team.coins < st.price) return 'coins';
  w.team.coins -= st.price;
  w.team.shop[item] = st.tier + 1;
  switch (fx.kind) {
    case 'repair':
      w.base.repairs++;
      w.base.hp = Math.min(w.base.maxHp, w.base.hp + fx.hp);
      break;
    case 'kit':
      p.kits++;
      break;
    case 'archers':
      for (let i = 0; i < fx.add && w.base.archers.count < s.cat.base.archers.at.length; i++) {
        w.base.archers.count++;
        w.base.archers.attack.push({ readyAt: 0, queued: false, aim: { x: 0, y: 0 }, windupEndsAt: null });
        w.base.archers.aim.push(Math.PI / 2);
      }
      break;
    case 'discharges':
      // Existing nets too (§6.2: building upgrades apply to every structure of the type).
      for (const n of w.structures) if (n.discharges !== null) n.discharges += fx.add;
      break;
    case 'stats':
    case 'module':
      if (fx.target === 'base' || fx.target === 'archers') refit(s, w.base, targetsOf('base'));
      else if (fx.target === 'squad') for (const u of w.soldiers) fitSoldier(s, u);
      else for (const x of w.structures) refit(s, x, targetsOf('structure', x.kind));
      break;
  }
  s.emit({ e: 'purchase', slot: p.slot, item, tier: def.repeatable ? 1 : st.tier + 1 });
  dropWish(w, item);
  return null;
}

/** The `request` command (§6.2): toggles this player's wish for an item they can see (build phase). */
export function request(s: FullState, p: PlayerEnt, item: ShopItemId, on: boolean): AckReason | null {
  const w = s.world;
  const def = s.cat.shopItem(item);
  if (!def) return 'invalid';
  if (w.phase !== 'build') return 'phase';
  const has = w.team.wishlist.some((x) => x.item === item && x.slot === p.slot);
  if (on) {
    if (!shownTo(def, p.classId)) return 'invalid';
    const st = itemState(s.cat.content, w, def);
    if (!st.visible || st.price === null) return 'invalid';
    if (has) return null;
    w.team.wishlist.push({ item, slot: p.slot });
  } else {
    if (!has) return null;
    w.team.wishlist = w.team.wishlist.filter((x) => !(x.item === item && x.slot === p.slot));
  }
  s.emit({ e: 'request', slot: p.slot, item, on });
  return null;
}
