// Upgrade cards in the run (SPEC §6.1, §15.3): each build phase every player gets a private offer of
// 3 from the seeded stream `cards:<wave>:<slot>` (a restored offer is identical, §15.8), with a
// guaranteed rare after any wave whose `WaveDef.boss` is set; the §6.1 exclusions run over the team
// (unique and owned, combos without both prerequisites, favored enemies that can't spawn for this
// team, cards for classes not on it). A pick adds a stack (×N) and rebuilds that card's modifier:
// the card's stats (and the commons' per-class numbers) times the stacks, plus its module built with
// `stacks`. Stats add, never multiply, and caps come from the rules (§6.1 stat math).
import type { CardDef } from '../../../content/types';
import type { CardId, EnemyId } from '../../../shared/ids';
import type { AckReason } from '../../../shared/messages';
import { cardEligible, offerRng, pickOffer } from '../../systems/cards';
import type { Catalog } from '../catalog';
import { effects as effectDefs, modules } from '../registry';
import type { FullState } from '../state';
import { refreshStats } from '../stats';
import type { Modifier, PlayerEnt, StatMod, World } from '../types';

/** §6.1: about 15% of offers include one rare. */
export const RARE_CHANCE = 0.15;
export const OFFER_SIZE = 3;

/** Combos count as rares: an offer holds at most one of either (BUILD_PLAN §8). */
const isRare = (c: CardDef) => c.tier !== 'common';

/** Classes that bring ranged attackers: without one, Flyers are replaced (§9, lifecycle.ts). */
const RANGED = new Set(['engineer', 'quartermaster']);

/** Can `enemy` still spawn for this team, from wave `from` on (Flyer substitution included)? */
export function canSpawnFor(cat: Catalog, world: World, enemy: EnemyId, from: number): boolean {
  if (enemy === 'flyer' && !world.players.some((p) => RANGED.has(p.classId))) return false;
  return cat.waves.some(
    (w) =>
      w.n >= from &&
      (w.allowed.includes(enemy) ||
        w.guaranteed.some((g) => g.enemy === enemy) ||
        w.boss?.id === enemy),
  );
}

/** The §6.1 picker exclusions for one player. */
export function eligibleFor(cat: Catalog, world: World, p: PlayerEnt): (c: CardDef) => boolean {
  const ctx = {
    owners: [p.classId, 'common'],
    owned: (id: string) => p.cards[id as CardId] ?? 0,
    canSpawn: (e: string) => canSpawnFor(cat, world, e as EnemyId, world.wave),
    teamHas: (cls: string) => world.players.some((q) => q.classId === cls),
  };
  return (c) => cardEligible(c, ctx);
}

/** Is the offer before wave `wave` owed a rare (the wave before it had a boss)? */
export function guaranteedRare(cat: Catalog, wave: number): boolean {
  return cat.wave(wave - 1)?.boss !== undefined;
}

/** One player's offer for the build phase before `world.wave`. */
export function offerFor(cat: Catalog, world: World, p: PlayerEnt): CardId[] {
  return pickOffer({
    pool: cat.content.cards,
    eligible: eligibleFor(cat, world, p),
    isRare,
    rareChance: RARE_CHANCE,
    guaranteedRare: guaranteedRare(cat, world.wave),
    size: OFFER_SIZE,
    rng: offerRng(world.seed, world.wave, p.slot),
  }).map((c) => c.id);
}

/** Build start: every player gets a fresh private offer. */
export function dealOffers(s: FullState): void {
  for (const p of s.world.players) {
    p.offer = offerFor(s.cat, s.world, p);
    p.picked = null;
  }
}

/** Combat start: offers not taken are gone (cards are free; nothing is refunded). */
export function closeOffers(s: FullState): void {
  for (const p of s.world.players) {
    p.offer = null;
    p.picked = null;
  }
}

function scaled(mods: readonly StatMod[], n: number): StatMod[] {
  return mods.map((m) => ({
    ...m,
    ...(m.addPct !== undefined ? { addPct: m.addPct * n } : {}),
    ...(m.add !== undefined ? { add: m.add * n } : {}),
  }));
}

/** The modifier a card held at `n` stacks gives this player (`card:<id>`). */
export function cardModifier(cat: Catalog, p: PlayerEnt, id: CardId, n: number): Modifier {
  const def = cat.content.cards.find((c) => c.id === id);
  const mod = def?.module ? modules[def.module.module] : undefined;
  const m: Modifier = mod ? mod.make({ ...(def?.module?.params ?? {}), stacks: n }) : { id: '' };
  m.id = `card:${id}`;
  const stats = [...(def?.stats ?? []), ...(def?.perClass?.[p.classId] ?? [])];
  if (stats.length > 0) m.stats = [...(m.stats ?? []), ...scaled(stats, n)];
  return m;
}

/** Puts the card's current modifier on the player (in place of an older stack count). */
function attachCard(s: FullState, p: PlayerEnt, id: CardId) {
  const m = cardModifier(s.cat, p, id, p.cards[id] ?? 0);
  const at = p.mods.findIndex((x) => x.id === m.id);
  if (at >= 0) p.mods[at] = m;
  else p.mods.push(m);
  const before = p.maxHp;
  refreshStats(p, s.baseStats.get(p.id)!, effectDefs, s.caps);
  // Vitality: the new max HP comes in full (a living player gains the difference).
  if (p.respawnAt === null && p.maxHp > before) p.hp += p.maxHp - before;
}

/** Rebuilds every card modifier from `p.cards` (a resumed run, FF14). */
export function attachAllCards(s: FullState, p: PlayerEnt): void {
  for (const id of Object.keys(p.cards) as CardId[]) if ((p.cards[id] ?? 0) > 0) attachCard(s, p, id);
}

/** The `card` command: a private pick of one card from the player's offer (build phase). */
export function pickCard(s: FullState, p: PlayerEnt, card: CardId): AckReason | null {
  if (s.world.phase !== 'build') return 'phase';
  if (p.picked !== null || !p.offer || !p.offer.includes(card)) return 'invalid';
  p.cards[card] = (p.cards[card] ?? 0) + 1;
  p.picked = card;
  attachCard(s, p, card);
  s.emit({ e: 'cardPicked', slot: p.slot, card });
  return null;
}
