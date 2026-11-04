// Scenario harness for headless sim tests (SPEC §15.9): a run with scripted phones, and helpers to
// reach a phase, move players and step until something happens.
import type { Content } from '../../../content';
import type { CardId, ClassId, DifficultyId, PlayerColorId } from '../../../shared/ids';
import { PLAYER_COLOR_IDS } from '../../../shared/ids';
import { createSim, ScriptedInputSource, type Sim } from '../index';
import type { PlayerEnt, RunStart, SimEvent } from '../types';

export interface Harness {
  sim: Sim;
  pads: ScriptedInputSource[];
  /** The player in `slot`. */
  p(slot: number): PlayerEnt;
  run(steps: number): void;
  /** Steps until `pred` holds; throws after `max` steps. Returns the steps taken. */
  until(pred: () => boolean, max?: number): number;
  /** Countdown → build of wave 1. */
  toBuild(): void;
  /** Build → combat (everyone ready). */
  toCombat(): void;
  /** Teleports a player (tiles). */
  put(slot: number, x: number, y: number): void;
  /** Pushes the wave's pending spawns far into the future, so combat stays open and empty. */
  holdSpawns(): void;
  /** Events of `kind` emitted during the last step. */
  events<K extends SimEvent['e']>(kind: K): Extract<SimEvent, { e: K }>[];
  /** Steps `n` times and collects every event of `kind`. */
  collect<K extends SimEvent['e']>(kind: K, n: number): Extract<SimEvent, { e: K }>[];
  /**
   * Build phase only: gives `slot` the card `n` times through the real pick command (the offer is
   * set to just that card first). Steps once per pick.
   */
  give(slot: number, card: CardId, n?: number): void;
}

export function startOf(players: number, seed = 1, classId: ClassId = 'engineer'): RunStart {
  return {
    seed,
    settings: { theme: 'neon-knights', difficulty: 'normal' },
    slots: Array.from({ length: players }, (_, i) => ({
      slot: i,
      name: `P${i + 1}`,
      color: PLAYER_COLOR_IDS[i] as PlayerColorId,
      classId,
      connected: true,
    })),
  };
}

export interface HarnessOptions {
  /** Class per slot (default: every slot the Engineer). */
  classes?: ClassId[];
  /** Content override (custom enemies for a scenario). */
  content?: Content;
  /** Run difficulty (default Normal, §2.2). */
  difficulty?: DifficultyId;
}

export function harness(players = 1, seed = 1, opts: HarnessOptions = {}): Harness {
  const pads = Array.from({ length: players }, () => new ScriptedInputSource());
  const sources = new Map(pads.map((pad, i) => [i, pad] as const));
  const start = startOf(players, seed);
  start.slots.forEach((sl, i) => (sl.classId = opts.classes?.[i] ?? sl.classId));
  if (opts.difficulty) start.settings.difficulty = opts.difficulty;
  const sim = createSim(start, { sources, content: opts.content });
  const h: Harness = {
    sim,
    pads,
    p: (slot) => sim.world.players.find((p) => p.slot === slot)!,
    run(steps) {
      for (let i = 0; i < steps; i++) sim.step();
    },
    until(pred, max = 60 * 120) {
      for (let i = 0; i < max; i++) {
        if (pred()) return i;
        sim.step();
      }
      if (pred()) return max;
      throw new Error(`until: not reached in ${max} steps (phase ${sim.world.phase})`);
    },
    toBuild() {
      h.until(() => sim.world.phase === 'build');
    },
    toCombat() {
      if (sim.world.phase === 'countdown') h.toBuild();
      for (const p of sim.world.players) sim.command({ c: 'ready', slot: p.slot, ready: true });
      h.until(() => sim.world.phase === 'combat', 5);
    },
    put(slot, x, y) {
      const p = h.p(slot);
      p.x = x;
      p.y = y;
    },
    holdSpawns() {
      for (const s of sim.world.spawns) s.atTick += 1e7;
    },
    events(kind) {
      return sim.world.events.filter((e) => e.e === kind) as never;
    },
    collect(kind, n) {
      const out: SimEvent[] = [];
      for (let i = 0; i < n; i++) {
        sim.step();
        out.push(...sim.world.events.filter((e) => e.e === kind));
      }
      return out as never;
    },
    give(slot, card, n = 1) {
      for (let i = 0; i < n; i++) {
        const p = h.p(slot);
        p.offer = [card];
        p.picked = null;
        sim.command({ c: 'card', slot, card });
        sim.step();
        if (p.picked !== card)
          throw new Error(`give: ${card} was not picked (phase ${sim.world.phase})`);
      }
    },
  };
  return h;
}
