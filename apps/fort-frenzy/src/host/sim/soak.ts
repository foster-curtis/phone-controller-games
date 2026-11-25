// Soak runs (SPEC §15.9, FF15): the content's whole run headless, every slot on autopilot and
// invincible, classes in a rotation; the state hash every `hashEvery` steps, so a rerun can be compared.
// A run can also be saved and resumed at one build phase (`resumeAt`, §11.5, RD14): the restored world
// must give the same snapshot back and hash the same on a second restore, then it plays on to the end.
// The Vitest suite runs a short form (`__tests__/soak.test.ts`); `scripts/soak.ts` runs the full one.
import type { Content } from '../../content';
import { CLASS_IDS, PLAYER_COLOR_IDS, SHOP_ITEM_IDS, type ClassId } from '../../shared/ids';
import { stateHash } from './hash';
import { hashEvery } from './recorder';
import { createSim, type Sim } from './sim';
import { resumeStart, takeSnapshot, type RunSnapshot, type SnapshotMeta } from './snapshot';
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
 * The soak's class mixes for `players`: 1 player plays each class alone (4 mixes); 2 players play
 * every pair (the same class twice included, 10 mixes); more players play the class list in each of
 * its rotations (4 mixes).
 */
export function soakMixes(players: number): ClassId[][] {
  if (players === 1) return CLASS_IDS.map((c) => [c]);
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
  /**
   * Save the run at this wave's build phase (after the card picks and purchases) and play on from a
   * restore of it, as a reloaded TV would (§11.5). Throws if the restore doesn't round-trip.
   */
  resumeAt?: number;
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
  /** Cards picked and shop purchases over the run. */
  cardsPicked: number;
  purchases: number;
  /** Enemy kinds seen (the boss included). */
  kinds: string[];
  /** Builds placed over the run (every knight's `buildsPlaced`). */
  builds: number;
  /** The snapshot the run was resumed from (`resumeAt`), else null. */
  resumed: RunSnapshot | null;
}

/** No run lasts an hour of sim time (target 22–27 min, BUILD_PLAN FF14/FF15). */
const RUN_CAP = 60 * 60 * 60;
/** The team shop's items, tried in a rotation. */
const SHOP = SHOP_ITEM_IDS;
/** The build-phase step `resumeAt` saves at (after the card picks at 30 and the buys at 60). */
const SAVE_AT = 90;

const SOAK_META: SnapshotMeta = {
  savedAt: 0,
  build: 'soak',
  runMs: 0,
  leaderKey: 'bot-0',
  ids: (slot) => ({ playerKey: `bot-${slot}`, deviceId: `bot-${slot}` }),
};

/** A soak sim: autopilot in every slot, every knight invincible. */
function soakSim(start: RunStart, content: Content | undefined): Sim {
  const sim = createSim(start, { content });
  for (const { slot } of start.slots)
    sim.setSource(slot, new AutopilotInputSource(() => sim.world, slot, sim.content));
  sim.command({ c: 'debug', slot: -1, action: 'invincible', on: true });
  return sim;
}

/**
 * Saves `sim` (in its build phase) through JSON, as localStorage does, and restores it twice: the
 * restored world must give the same snapshot back, and both restores must hash the same (§15.8).
 * Returns the first restore, on autopilot.
 */
export function soakResume(sim: Sim, content?: Content): { sim: Sim; snapshot: RunSnapshot } {
  const raw = JSON.stringify(takeSnapshot(sim.world, sim.content, SOAK_META));
  const snapshot = JSON.parse(raw) as RunSnapshot;
  const a = soakSim(
    resumeStart(snapshot, () => true),
    content,
  );
  const b = createSim(
    resumeStart(JSON.parse(raw) as RunSnapshot, () => true),
    { content },
  );
  if (JSON.stringify(takeSnapshot(a.world, a.content, SOAK_META)) !== raw)
    throw new Error(`soak resume: wave ${snapshot.wave} restored a different snapshot`);
  if (stateHash(a.world) !== stateHash(b.world))
    throw new Error(`soak resume: two restores of wave ${snapshot.wave} hash differently`);
  return { sim: a, snapshot };
}

export function soakStart(seed: number, classes: readonly ClassId[]): RunStart {
  return {
    seed,
    settings: { difficulty: 'normal' },
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
 * One soak run: autopilot in every slot, invincible, ready 2 s into each build phase, as
 * `recordAutopilotRun`. Throws if the sim throws; the caller checks the outcome.
 */
export function soakRun(opts: SoakOptions): SoakResult {
  const classes = [...opts.classes];
  let sim = soakSim(soakStart(opts.seed, classes), opts.content);
  const max = opts.maxSteps ?? RUN_CAP;
  const holdBase = opts.holdBase ?? true;
  const hashes: number[] = [];
  const kinds = new Set<string>();
  let maxEnemies = 0;
  let cardsPicked = 0;
  let purchases = 0;
  let result: SoakResult['result'] = null;
  let buildStart = -1;
  let resumed: RunSnapshot | null = null;
  /** Steps run before a resume (the restored world's tick starts over). */
  let before = 0;
  let w = sim.world;
  for (let i = 0; i < max && w.phase !== 'summary'; i++) {
    // The base holds (as players are invincible), so every run plays all of its waves.
    if (holdBase && w.base.hp > 0) w.base.hp = w.base.maxHp;
    if (w.phase === 'build') {
      if (buildStart < 0) buildStart = w.tick;
      const at = w.tick - buildStart;
      if (at === SAVE_AT && w.wave === opts.resumeAt && !resumed) {
        // A TV reload: the saved build phase comes back (its timer from the start) and plays on.
        const r = soakResume(sim, opts.content);
        before += w.tick;
        sim = r.sim;
        w = sim.world;
        resumed = r.snapshot;
        buildStart = w.tick - SAVE_AT - 1;
        continue;
      }
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
      if (w.tick - buildStart > 120) {
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
    steps: before + w.tick,
    wave: w.wave,
    phase: w.phase,
    result,
    hashes,
    maxEnemies,
    cardsPicked,
    purchases,
    kinds: [...kinds].sort(),
    builds: w.players.reduce((n, p) => n + p.run.buildsPlaced, 0),
    resumed,
  };
}
