// Pure rules for how a build and an HP bar look (SPEC §2.6, §7.5; RD5): which of the five frames a
// build shows, when its amber HP bar appears, the arc and spin of a throw, and the violet enemy
// bar's size. No Phaser, so they are tested headless.
import type { BuildPhase } from './types';

/** A build shows its `damaged` frame once its HP is below this fraction (SPEC §7.5). */
export const DAMAGED_BELOW = 0.5;
/** The `destroyed` frame shows this long before the scrap pile replaces it (SPEC §7.5). */
export const DESTROYED_HOLD_MS = 600;
/** Scrap pile size a destroyed build leaves (structure-sized, §2.4 scrap). */
export const BUILD_SCRAP_SIZE = 3;

export interface BuildPhaseInput {
  /** The sim's `BuildEnt.state`. */
  state: 'flight' | 'landed' | 'active';
  hp: number;
  maxHp: number;
  /** The sim removed it as destroyed (`buildGone`), and the view is still holding its wreck. */
  destroyed?: boolean;
}

/** HP fraction, or 1 for a build without HP (a mine, the flag). */
export function hpFraction(hp: number, maxHp: number): number {
  return maxHp > 0 ? Math.max(0, Math.min(1, hp / maxHp)) : 1;
}

/** The frame state a build shows: below half HP `damaged`, a wreck `destroyed`. */
export function buildPhase(b: BuildPhaseInput): BuildPhase {
  if (b.destroyed) return 'destroyed';
  if (b.state === 'flight') return 'flight';
  if (b.maxHp > 0 && b.hp / b.maxHp < DAMAGED_BELOW) return 'damaged';
  return b.state;
}

/** Bars show only once damaged (hidden at full HP) and while there is HP left. */
export function hpBarShown(hp: number, maxHp: number): boolean {
  return maxHp > 0 && hp > 0 && hp < maxHp;
}

/** A build's HP bar: only an HP build that is standing, hurt and not mid-throw. */
export function buildBarShown(phase: BuildPhase, hpFrac: number): boolean {
  return (phase === 'landed' || phase === 'active' || phase === 'damaged') && hpFrac < 1;
}

// ---- throws -------------------------------------------------------------------------------------

/** Peak throw height in tiles for a throw of `distTiles` (a low lob that grows with distance). */
export function throwHeight(u: number, distTiles: number): number {
  const peak = Math.min(2.2, 0.8 + distTiles * 0.2);
  return 4 * peak * u * (1 - u);
}

/** Turns a thrown build makes between hand and ground. */
export const THROW_TURNS = 2;
/** Spin angle (radians) at throw progress u. */
export const throwSpin = (u: number): number => u * THROW_TURNS * Math.PI * 2;

/** Progress 0..1 along a flight at a (fractional) tick. */
export function flightProgress(tick: number, launchedAt: number, landsAt: number): number {
  const span = landsAt - launchedAt;
  return span <= 0 ? 1 : Math.max(0, Math.min(1, (tick - launchedAt) / span));
}

// ---- enemy HP bars (§2.6) -----------------------------------------------------------------------

/** Scrap mites have no bar; the Colossus keeps its bottom-edge boss bar. */
export function enemyHasHpBar(rigId: string, boss: boolean): boolean {
  return rigId !== 'mite' && !boss;
}

const ENEMY_BAR_MIN_PX = 24;
const ENEMY_BAR_MAX_PX = 64;

/** Bar width in screen px by enemy size: the rig's hitbox radius (tiles) times the tile width. */
export function enemyBarWidth(hitboxTiles: number, tilePx: number): number {
  return Math.max(
    ENEMY_BAR_MIN_PX,
    Math.min(ENEMY_BAR_MAX_PX, Math.round(hitboxTiles * tilePx * 1.9)),
  );
}
