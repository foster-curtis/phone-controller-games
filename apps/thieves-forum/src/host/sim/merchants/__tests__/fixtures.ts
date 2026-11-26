// Test fixtures for merchants and stall theft (SPEC §6.6, §6.7): a quiet sim in `play` with every stall
// open and no crowd, players placed at a stall's counter, a fake ledger (TF10 implements the real one)
// and helpers to send commands and hold the button.
import { CONTENT } from '../../../../content';
import type { Content } from '../../../../content/types';
import type { Ledger, PackEntry, Side } from '../../ledger/types';
import { THEFT_HOOKS } from '../../stalls';
import type { Character, Merchant, PlayerInput, SimCommand, SimEvent, Stall } from '../../types';
import { createSim, type Sim } from '../../world';
import { roundStart } from '../../__tests__/helpers';

/** The bakery (top row): common counter items and an uncommon honey cake on the shelf. */
export const BAKERY = 1;
/** The spices stall (middle row), for "only at his own stall". */
export const SPICES = 7;

export function fakeLedger(): Ledger & { packs: Map<string, PackEntry[]> } {
  const packs = new Map<string, PackEntry[]>();
  const pack = (s: Side) => packs.get(s.id) ?? [];
  return {
    packs,
    open: (side, startPurse) => ({ side, purse: startPurse, pack: [], startPurse }),
    account: () => null,
    credit() {},
    debit: () => 0,
    addItem(side, entry) {
      const p = pack(side);
      if (p.reduce((n, e) => n + e.weight, 0) + entry.weight > CONTENT.balance.match.packCapacity)
        return false;
      packs.set(side.id, [...p, entry]);
      return true;
    },
    removeItem: () => null,
    packWeight: (side) => pack(side).reduce((n, e) => n + e.weight, 0),
    pot: () => 0,
    haul: () => 0,
    sides: () => [],
  };
}

export interface Rig {
  sim: Sim;
  input: Map<string, PlayerInput>;
  /** Steps once with these commands (and the current inputs); returns that step's events. */
  step(commands?: SimCommand[]): SimEvent[];
  /** Steps `n` times, collecting every event. */
  run(n: number): SimEvent[];
  player(i: number): Character;
  stall(id: number): Stall;
  merchant(stall: number): Merchant;
  /** Puts player `i` at `stall`'s counter and taps BROWSE. */
  browse(i: number, stall: number, at?: number): SimEvent[];
  hold(i: number, on: boolean): void;
}

export function rig(players = 2, content: Content = CONTENT): Rig {
  const sim = createSim(roundStart(1, players, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]), content);
  sim.world.phase = 'play';
  sim.world.phaseEndsAt = 1_000_000;
  sim.world.plannedNpcs = 0;
  const input = new Map<string, PlayerInput>();
  const r: Rig = {
    sim,
    input,
    step(commands = []) {
      sim.step(input, commands);
      return [...sim.events()];
    },
    run(n) {
      const out: SimEvent[] = [];
      for (let i = 0; i < n; i++) out.push(...r.step());
      return out;
    },
    player: (i) => sim.world.characters[i - 1]!,
    stall: (id) => sim.world.stalls.find((s) => s.id === id)!,
    merchant: (stall) => sim.world.merchants.find((m) => m.stall === stall)!,
    browse(i, stall, at = 0.5) {
      const d = content.layout.stalls[stall]!.customer;
      const c = r.player(i);
      c.x = d.x0 + (d.x1 - d.x0) * at;
      c.y = d.y;
      c.vx = 0;
      c.vy = 0;
      return r.step([{ k: 'browse', player: `p${i}` }]);
    },
    hold(i, on) {
      input.set(`p${i}`, { move: { x: 0, y: 0 }, hold: on, catch: false });
    },
  };
  r.step(); // stocks the stalls and creates the merchants
  return r;
}

/** No glances until a test asks for one. */
export function noGlances(r: Rig): void {
  for (const m of r.sim.world.merchants) m.nextGlanceAt = 1e9;
}

export function withLedger(): ReturnType<typeof fakeLedger> {
  const l = fakeLedger();
  THEFT_HOOKS.ledger = l;
  return l;
}

export const tv = (es: readonly SimEvent[]) => es.filter((e) => e.ch === 'tv');
export const phone = (es: readonly SimEvent[]) => es.filter((e) => e.ch === 'phone');
