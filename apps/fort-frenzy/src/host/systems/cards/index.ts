// Generic card offers: the §6.1 exclusion rules and one pure picker, so a v2 reroll is just another call
// (SPEC §6.1, §13, §15.4). Extraction-ready (§15.1): cards, owners, classes and enemies are plain
// strings; Fort Frenzy's `CardDef` fits `CardLike` as is.
// Frozen at FF2 (BUILD_PLAN §3): additive changes only.
import { rngStream, type Rng } from '@pcg/game-kit';

/** The card fields the exclusion rules read. */
export interface CardLike {
  id: string;
  /** A class id, or a shared owner such as `'common'`. */
  owner: string;
  unique?: boolean;
  /** Combo prerequisites: offered only once both are owned. Combos are unique. */
  requires?: readonly string[];
  /** Offered only if this enemy can spawn for the team. */
  favoredEnemy?: string;
  /** Offered only if this class is on the team. */
  requiresClass?: string;
}

export interface EligibilityCtx {
  /** Owners whose cards this player may get (their class plus the shared owner). */
  owners: readonly string[];
  /** Stacks of a card the player owns (0 = none). */
  owned(id: string): number;
  canSpawn(enemy: string): boolean;
  teamHas(classId: string): boolean;
}

/** §6.1 "the card picker excludes" rules. */
export function cardEligible(card: CardLike, ctx: EligibilityCtx): boolean {
  if (!ctx.owners.includes(card.owner)) return false;
  const isCombo = card.requires !== undefined && card.requires.length > 0;
  if ((card.unique || isCombo) && ctx.owned(card.id) > 0) return false;
  if (isCombo && !card.requires!.every((id) => ctx.owned(id) > 0)) return false;
  if (card.favoredEnemy !== undefined && !ctx.canSpawn(card.favoredEnemy)) return false;
  if (card.requiresClass !== undefined && !ctx.teamHas(card.requiresClass)) return false;
  return true;
}

/** The seeded stream for one player's offer: `cards:<wave>:<slot>` (§15.3). */
export function offerRng(seed: number, wave: number, slot: number): Rng {
  return rngStream(seed, `cards:${wave}:${slot}`);
}

function take<T>(xs: T[], rng: Rng): T {
  return xs.splice(rng.int(0, xs.length - 1), 1)[0]!;
}

/**
 * Up to `size` distinct eligible cards (first listing of an id wins), at most one rare. A rare is
 * included when `guaranteedRare` or the roll is under `rareChance`, and also fills in when the commons
 * run out. Always draws the roll first, so the stream's use doesn't depend on the pool.
 */
export function pickOffer<C extends { id: string }>(input: {
  pool: readonly C[];
  eligible: (c: C) => boolean;
  isRare: (c: C) => boolean;
  rareChance: number;
  guaranteedRare: boolean;
  size: number;
  rng: Rng;
}): C[] {
  const { rng, size } = input;
  const seen = new Set<string>();
  const commons: C[] = [];
  const rares: C[] = [];
  for (const c of input.pool) {
    if (seen.has(c.id) || !input.eligible(c)) continue;
    seen.add(c.id);
    (input.isRare(c) ? rares : commons).push(c);
  }
  const wantRare = rng.next() < input.rareChance || input.guaranteedRare;
  const out: C[] = [];
  let rare = false;
  if (wantRare && rares.length > 0 && size > 0) {
    out.push(take(rares, rng));
    rare = true;
  }
  while (out.length < size && commons.length > 0) out.push(take(commons, rng));
  if (out.length < size && !rare && rares.length > 0) out.push(take(rares, rng));
  // Shuffle so the rare's position varies.
  for (let i = out.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}
