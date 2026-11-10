// Soak runs (SPEC §15.9, FF15): the content's whole run headless, every slot on autopilot and
// invincible, classes in a rotation; the state hash every `hashEvery` steps, so a rerun can be compared.
// The Vitest suite runs a short form (`__tests__/soak.test.ts`); `scripts/soak.ts` runs the full one.
import type { Content } from '../../content';
import { CLASS_IDS, PLAYER_COLOR_IDS, SHOP_ITEM_IDS, type ClassId } from '../../shared/ids';
import { stateHash } from './hash';
import { hashEvery } from './recorder';
import { createSim, type Sim } from './sim';
import { AutopilotInputSource } from './sources';
import type { Phase, RunStart } from './types';

/** Class per slot: the class list shifted by `rotation` (6 players: every class in every run). */
export function soakClasses(players: number, rotation: number): ClassId[] {
  return Array.from(
    { length: players },
    (_, slot) => CLASS_IDS[(slot + rotation) % CLASS_IDS.length]!,
  );
}

/**
 * The soak's class mixes for `players`: 2 players play every pair (the same class twice included,
 * 10 mixes); more players play the class list in each of its rotations (4 mixes).
 */
export function soakMixes(players: number): ClassId[][] {
  if (players === 2) {
    const out: ClassId[][] = [];
    for (let a = 0; a < CLASS_IDS.length; a++)
      for (let b = a; b < CLASS_IDS.length; b++) out.push([CLASS_IDS[a]!, CLASS_IDS[b]!]);
    return out;
  }
  return CLASS_IDS.map((_, r) => soakClasses(players, r));
}

export interface SoakOptions {
  seed: number;
  /** Class per slot (`soakMixes`, `soakClasses`). */
  classes: readonly ClassId[];
  /** Stop after this many steps (the short form); default: the run must reach its summary. */
  maxSteps?: number;
  /** Keep the Citadel at full HP (default), so a weak class mix still reaches wave 15. */
  holdBase?: boolean;
  content?: Content;
  /** Called after every step (the bench times them; tests count entities). */
  onStep?: (sim: Sim) => void;
}

export interface SoakResult {
  classes: ClassId[];
  steps: number;
  /** The last wave reached and the final phase. */
  wave: number;
  phase: Phase;
  result: 'victory' | 'defeat' | null;
  /** State hash after every `hashEvery` steps. */
  hashes: number[];
  maxEnemies: number;
  /** Cards picked and shop purchases (crates included) over the run. */
  cardsPicked: number;
  purchases: number;
  /** Enemy kinds seen (the boss included). */
  kinds: string[];
}

/** No run lasts an hour of sim time (target 22–27 min, BUILD_PLAN FF14/FF15). */
const RUN_CAP = 60 * 60 * 60;
/** The team shop's upgrades (crates are the autopilot's own). */
const SHOP = SHOP_ITEM_IDS.filter((id) => id !== 'crate');

export function soakStart(seed: number, classes: readonly ClassId[]): RunStart {
  return {
    seed,
    settings: { theme: 'neon-knights', difficulty: 'normal' },
    slots: classes.map((classId, slot) => ({
      slot,
      name: `Bot${slot + 1}`,
      color: PLAYER_COLOR_IDS[slot % PLAYER_COLOR_IDS.length]!,
      classId,
      connected: true,
    })),
  };
}

/**
 * One soak run: autopilot in every slot, invincible, ready once stocked (2 s in) or after 10 s of
 * build, as `recordAutopilotRun`. Throws if the sim throws; the caller checks the outcome.
 */
export function soakRun(opts: SoakOptions): SoakResult {
  const classes = [...opts.classes];
  const sim = createSim(soakStart(opts.seed, classes), { content: opts.content });
  for (let slot = 0; slot < classes.length; slot++)
    sim.setSource(slot, new AutopilotInputSource(() => sim.world, slot, sim.content));
  sim.command({ c: 'debug', slot: -1, action: 'invincible', on: true });
  const max = opts.maxSteps ?? RUN_CAP;
  const holdBase = opts.holdBase ?? true;
  const hashes: number[] = [];
  const kinds = new Set<string>();
  let maxEnemies = 0;
  let cardsPicked = 0;
  let purchases = 0;
  let result: SoakResult['result'] = null;
  let buildStart = -1;
  const w = sim.world;
  for (let i = 0; i < max && w.phase !== 'summary'; i++) {
    // The base holds (as players are invincible), so every run plays all of its waves.
    if (holdBase && w.base.hp > 0) w.base.hp = w.base.maxHp;
    if (w.phase === 'build') {
      if (buildStart < 0) buildStart = w.tick;
      const at = w.tick - buildStart;
      for (const p of w.players) {
        // Cards and the team shop run too (their hooks are hot paths): a card from each offer, and
        // one shop item a wave per player in a rotation (refused when the team can't afford it).
        if (at === 30 && p.offer && p.offer.length > 0 && p.picked === null) {
          const card = p.offer[(w.wave + p.slot) % p.offer.length]!;
          sim.command({ c: 'card', slot: p.slot, card });
        }
        if (at === 60) {
          const item = SHOP[(w.wave + p.slot) % SHOP.length]!;
          sim.command({ c: 'buy', slot: p.slot, item });
        }
      }
      const stocked = w.players.every((p) => p.crates >= 2 || w.team.coins < 2);
      if ((stocked && w.tick - buildStart > 120) || w.tick - buildStart > 600) {
        for (const p of w.players)
          if (!p.ready) sim.command({ c: 'ready', slot: p.slot, ready: true });
      }
    } else {
      buildStart = -1;
    }
    sim.step();
    for (const ev of w.events) {
      if (ev.e === 'runEnd') result = ev.result;
      else if (ev.e === 'cardPicked') cardsPicked++;
      else if (ev.e === 'purchase') purchases++;
    }
    if (w.enemies.length > maxEnemies) maxEnemies = w.enemies.length;
    for (const e of w.enemies) kinds.add(e.kind);
    if (w.tick % hashEvery === 0) hashes.push(stateHash(w));
    opts.onStep?.(sim);
  }
  return {
    classes,
    steps: w.tick,
    wave: w.wave,
    phase: w.phase,
    result,
    hashes,
    maxEnemies,
    cardsPicked,
    purchases,
    kinds: [...kinds].sort(),
  };
}
