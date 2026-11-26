// The team shop in the run (SPEC §3.4, §3.5, §6.2, §10.3): any player buys any item they can see
// from the team's coins in the build phase; prices rise per tier; upgrades apply as `shop:<item>`
// modifiers; every purchase is announced (`purchase` event); the wishlist takes requests and clears
// an item when it's bought, and everything at the wave start.
// The row helpers are pure on (content, world), so phone views use the same rules as the sim.
import type { Content } from '../../../content';
import { HOLD_CONFIRM_PRICE } from '../../../content/balance';
import type { Condition, ShopItemDef, StatMod, UpgradeTarget } from '../../../content/types';
import type { ShopItemId } from '../../../shared/ids';
import type { AckReason } from '../../../shared/messages';
import type { FullState } from '../state';
import { effects as effectDefs, modules } from '../registry';
import { refreshStats } from '../stats';
import type { Modifier, PlayerEnt, TeamState, Unit, World } from '../types';

// ---- visibility and prices (pure) ---------------------------------------------------------------

export function conditionMet(cond: Condition | undefined, world: World): boolean {
  if (!cond) return true;
  if ('teamHasAny' in cond) return world.players.some((p) => cond.teamHasAny.includes(p.classId));
  return world.wave >= cond.waveAtLeast;
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
export function itemState(_content: Content, world: World, def: ShopItemDef): ShopItemState {
  const owned = world.team.shop[def.id] ?? 0;
  let next: ShopItemDef['tiers'][number] | undefined;
  if (def.id === 'repair') next = def.tiers[Math.min(world.base.repairs, def.tiers.length - 1)];
  else if (def.repeatable) next = def.tiers[0];
  else next = def.tiers[owned];
  const visible = conditionMet(def.visibleIf, world);
  const price = next ? next.price : null;
  return {
    tier: owned,
    maxTier: def.repeatable ? 0 : def.tiers.length,
    price,
    visible,
    holdToConfirm: def.holdToConfirm ?? (price !== null && price >= HOLD_CONFIRM_PRICE),
  };
}

// ---- shop modifiers on units --------------------------------------------------------------------

/** The base and its sentries take every base and sentry upgrade. */
const BASE_TARGETS: readonly UpgradeTarget[] = ['base', 'archers'];

/** The `shop:<item>` modifiers a unit gets from the tiers the team owns. */
export function shopModifiers(
  content: Content,
  team: TeamState,
  targets: readonly UpgradeTarget[],
): Modifier[] {
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

/** Puts the current `shop:*` modifiers on a unit; a higher max HP comes in full. */
function refit(s: FullState, u: Unit, targets: readonly UpgradeTarget[]) {
  const keep = u.mods.filter((m) => !m.id.startsWith('shop:'));
  u.mods.length = 0;
  u.mods.push(...keep, ...shopModifiers(s.cat.content, s.world.team, targets));
  const before = u.maxHp;
  refreshStats(u, s.baseStats.get(u.id)!, effectDefs, s.caps);
  if (u.hp > 0 && u.maxHp > before) u.hp += u.maxHp - before;
}

/** The base and its archers get the team's upgrades (a resumed run, FF14). */
export function refitBase(s: FullState): void {
  refit(s, s.world.base, BASE_TARGETS);
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
  const st = itemState(s.cat.content, w, def);
  if (!st.visible || st.price === null) return 'invalid';
  const tier =
    def.id === 'repair'
      ? def.tiers[Math.min(w.base.repairs, def.tiers.length - 1)]!
      : def.repeatable
        ? def.tiers[0]!
        : def.tiers[st.tier]!;
  const fx = tier.effect;
  if (fx.kind === 'repair' && w.base.hp >= w.base.maxHp) return 'invalid';
  if (fx.kind === 'archers' && w.base.archers.count >= s.cat.base.archers.at.length)
    return 'invalid';
  if (w.team.coins < st.price) return 'coins';
  w.team.coins -= st.price;
  w.team.shop[item] = st.tier + 1;
  switch (fx.kind) {
    case 'repair':
      w.base.repairs++;
      w.base.hp = Math.min(w.base.maxHp, w.base.hp + fx.hp);
      break;
    case 'archers':
      for (let i = 0; i < fx.add && w.base.archers.count < s.cat.base.archers.at.length; i++) {
        w.base.archers.count++;
        w.base.archers.attack.push({
          readyAt: 0,
          queued: false,
          aim: { x: 0, y: 0 },
          windupEndsAt: null,
        });
        w.base.archers.aim.push(Math.PI / 2);
      }
      break;
    case 'stats':
    case 'module':
      // A base max HP tier raises current HP by the same amount (refit, §6.2 #95).
      refit(s, w.base, BASE_TARGETS);
      break;
  }
  s.emit({ e: 'purchase', slot: p.slot, item, tier: def.repeatable ? 1 : st.tier + 1 });
  dropWish(w, item);
  return null;
}

/** The `request` command (§6.2): toggles this player's wish for an item they can see (build phase). */
export function request(
  s: FullState,
  p: PlayerEnt,
  item: ShopItemId,
  on: boolean,
): AckReason | null {
  const w = s.world;
  const def = s.cat.shopItem(item);
  if (!def) return 'invalid';
  if (w.phase !== 'build') return 'phase';
  const has = w.team.wishlist.some((x) => x.item === item && x.slot === p.slot);
  if (on) {
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
