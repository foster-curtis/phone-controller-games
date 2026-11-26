// The debug panel's readouts (SPEC §9.5, RD6): portal activity and the hot side from the sim's spawn
// plan, and each knight's build meter; and the Cards section's knight list, card picker and give
// check (RD6-fix-2). Pure (no DOM), so the panel and `__pcg` read the same thing.
import type { Content } from '../content';
import {
  PORTAL_IDS,
  type BuildId,
  type CardId,
  type ClassId,
  type PlayerColorId,
  type PortalId,
  type SideId,
} from '../shared/ids';
import { giveRefusal, isUniqueCard } from './sim/cards';
import { STEP_MS, type World } from './sim/types';

export interface PortalActivity {
  id: PortalId;
  side: SideId;
  /** Groups still to spawn here this wave. */
  queued: number;
  /** Flared, its group not out yet (§9.4: the ~1 s flare). */
  flaring: boolean;
  /** Until its next group spawns, or null with none queued. */
  nextInMs: number | null;
}

export interface HotState {
  /** The hot side of the next pulse still to spawn, or null with nothing queued. */
  hot: SideId | null;
  /** The debug panel's forced hot side, or null. */
  forced: SideId | null;
  portals: PortalActivity[];
}

export function hotState(w: World | null, content: Content, forced: SideId | null): HotState {
  const portals = content.map?.portals;
  const spawns = w?.spawns ?? [];
  const next = spawns.reduce<(typeof spawns)[number] | null>(
    (a, g) => (a === null || g.atTick < a.atTick ? g : a),
    null,
  );
  return {
    hot: next?.hot ?? null,
    forced,
    portals: PORTAL_IDS.map((id) => {
      const mine = spawns.filter((g) => g.portal === id);
      const at = mine.length > 0 ? Math.min(...mine.map((g) => g.atTick)) : null;
      return {
        id,
        side: portals?.[id].side ?? 'bottom',
        queued: mine.length,
        flaring: mine.some((g) => g.flared),
        nextInMs: at === null || !w ? null : Math.max(0, Math.round((at - w.tick) * STEP_MS)),
      };
    }),
  };
}

export interface MeterState {
  slot: number;
  build: BuildId;
  /** 0..1 (§7.2). */
  meter: number;
  full: boolean;
  /** A thrown build's aim is held (the TV draws the throw preview). */
  aiming: boolean;
  /** This knight's builds on the map. */
  active: number;
}

export function meterStates(w: World | null, content: Content): MeterState[] {
  if (!w) return [];
  return w.players.map((p) => ({
    slot: p.slot,
    build: content.knights.find((k) => k.id === p.classId)?.build ?? 'shield_gen',
    meter: p.meter,
    full: p.meter >= 1,
    aiming: p.buildAim !== null,
    active: w.builds.filter((b) => b.owner === p.slot).length,
  }));
}

/** One line for the panel: "hot left (forced) · bottom-w 2 ⚑ 0.8 s · …". */
export function hotLine(h: HotState): string {
  const head = `hot ${h.hot ?? '—'}${h.forced ? ` (forced ${h.forced})` : ''}`;
  const live = h.portals
    .filter((p) => p.queued > 0)
    .map(
      (p) =>
        `${p.id} ${p.queued}${p.flaring ? ' FLARE' : ''}` +
        (p.nextInMs === null ? '' : ` ${(p.nextInMs / 1000).toFixed(1)}s`),
    );
  return [head, ...live].join(' · ');
}

// ---- cards (RD6-fix-2) -------------------------------------------------------------------------

/** One knight for the panel's Cards section. */
export interface KnightRow {
  /** Run slot; null in the lobby (slots are given at the run start). */
  slot: number | null;
  name: string;
  color: PlayerColorId;
  classId: ClassId;
  /** Stacks owned (none in the lobby). */
  cards: Partial<Record<CardId, number>>;
  /** In the run (the panel can give it cards). */
  inRun: boolean;
  /** Left the game mid-run (RD6-fix-1): its knight stays on the map, dazed. */
  left: boolean;
}

/** The party fields the list reads. */
export interface RowMember {
  name: string;
  color: PlayerColorId;
  classId: ClassId | null;
  slot: number | null;
}

/**
 * The knights in play: the run's knights (late joiners included, a player who left marked) or, in the
 * lobby, the members who have chosen a knight. Knight changes happen in the lobby (§11.2).
 */
export function knightsInPlay(members: readonly RowMember[], w: World | null): KnightRow[] {
  if (w)
    return w.players.map((p) => ({
      slot: p.slot,
      name: p.name,
      color: p.color,
      classId: p.classId,
      cards: { ...p.cards },
      inRun: true,
      left: !members.some((m) => m.slot === p.slot),
    }));
  return members.flatMap((m) =>
    m.classId === null
      ? []
      : [
          {
            slot: null,
            name: m.name,
            color: m.color,
            classId: m.classId,
            cards: {},
            inRun: false,
            left: false,
          },
        ],
  );
}

export type DisplayNames = Readonly<Record<string, string>>;

/** One line: "0 · cobalt · Warden (P1) · Vitality ×2, Challenger". */
export function knightLine(r: KnightRow, names: DisplayNames): string {
  const owned = (Object.entries(r.cards) as [CardId, number][])
    .filter(([, n]) => n > 0)
    .map(([id, n]) => `${names[id] ?? id}${n > 1 ? ` ×${n}` : ''}`);
  return [
    r.slot ?? '—',
    r.color,
    `${names[r.classId] ?? r.classId}${r.name ? ` (${r.name})` : ''}${r.left ? ' [left]' : ''}`,
    owned.length > 0 ? owned.join(', ') : 'no cards',
  ].join(' · ');
}

/** One card in the picker. */
export interface CardChoice {
  id: CardId;
  /** "Shared commons", or the knight's commons / rares / combos. */
  group: string;
  /** "Deadeye (rare) (needs Steady Aim) ×1". */
  label: string;
  unique: boolean;
  /** Prerequisites the knight doesn't own (bypassed by the give; shown as "needs"). */
  needs: CardId[];
  owned: number;
}

const TIER_GROUP = { common: 'commons', rare: 'rares', combo: 'combos' } as const;

/**
 * Every card a knight of `classId` could ever hold (the shared commons, then its own, content order,
 * its unique passive included), with the knight's stacks and unmet prerequisites.
 */
export function cardChoices(
  content: Content,
  classId: ClassId,
  owned: Partial<Record<CardId, number>>,
  names: DisplayNames,
): CardChoice[] {
  const knight = names[classId] ?? classId;
  const name = (id: CardId) => names[id] ?? id;
  const mine = content.cards.filter((c) => c.owner === 'common' || c.owner === classId);
  return [
    ...mine.filter((c) => c.owner === 'common'),
    ...mine.filter((c) => c.owner !== 'common'),
  ].map((c) => {
    const needs = (c.requires ?? []).filter((id) => (owned[id] ?? 0) === 0);
    const n = owned[c.id] ?? 0;
    const unique = isUniqueCard(c);
    const tags = [
      c.owner === 'common' ? null : c.tier,
      unique && c.tier !== 'combo' ? 'unique' : null,
    ].filter((t) => t !== null);
    return {
      id: c.id,
      group: c.owner === 'common' ? 'Shared commons' : `${knight} ${TIER_GROUP[c.tier]}`,
      label:
        name(c.id) +
        (tags.length > 0 ? ` (${tags.join(', ')})` : '') +
        (needs.length > 0 ? ` (needs ${needs.map(name).join(' + ')})` : '') +
        (n > 0 ? ` ×${n}` : ''),
      unique,
      needs,
      owned: n,
    };
  });
}

/**
 * Why the panel can't give `card` to run slot `slot` now, or null when it can (the sim's own check,
 * `giveRefusal`, in words). `requires` never refuses: the give bypasses it.
 */
export function giveMessage(
  w: World | null,
  content: Content,
  slot: number,
  card: CardId,
  names: DisplayNames,
): string | null {
  if (!w) return 'No run: cards are given in a run';
  const p = w.players.find((x) => x.slot === slot);
  if (!p) return `No knight in slot ${slot}`;
  const knight = names[p.classId] ?? p.classId;
  switch (giveRefusal(content.cards, p.classId, p.cards, card)) {
    case 'invalid':
      return `${names[card] ?? card} is not a ${knight} card`;
    case 'cap':
      return `${names[card] ?? card} is unique: the ${knight} in slot ${slot} already has it`;
    case null:
      return null;
  }
}
