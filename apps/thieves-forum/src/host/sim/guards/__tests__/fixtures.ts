// Test fixtures for guards and catches (SPEC §6.12, §6.13): a quiet play-phase sim with no starting
// guards, a fake ledger (TF10 implements the real one), mid-steal holds and single-system stepping.
import type { ItemId } from '../../../../content/types';
import { quietSim } from '../../__tests__/helpers';
import { attachLedger } from '../../catches';
import type { Ledger, PackEntry, Payee, Side, SideAccount } from '../../ledger/types';
import type { StepContext } from '../../systems';
import type { Character, EntityId, Hold, PlayerInput, SimEvent } from '../../types';
import type { Sim } from '../../world';

export interface FakeLedger extends Ledger {
  calls: { op: string; side: string; amount?: number; to?: Payee; item?: ItemId }[];
}

export function fakeLedger(purse = 100): FakeLedger {
  const accts = new Map<string, SideAccount>();
  const calls: FakeLedger['calls'] = [];
  const acct = (s: Side): SideAccount => {
    let a = accts.get(s.id);
    if (!a) {
      a = { side: s, purse, pack: [], startPurse: purse };
      accts.set(s.id, a);
    }
    return a;
  };
  return {
    calls,
    open: (s, p) => {
      const a = { side: s, purse: p, pack: [], startPurse: p };
      accts.set(s.id, a);
      return a;
    },
    account: (s) => acct(s),
    credit(s, amount) {
      calls.push({ op: 'credit', side: s.id, amount });
      acct(s).purse += amount;
    },
    debit(s, amount, to) {
      const a = acct(s);
      const taken = Math.min(a.purse, amount);
      a.purse -= taken;
      calls.push({ op: 'debit', side: s.id, amount: taken, to });
      return taken;
    },
    addItem(s, e: PackEntry) {
      acct(s).pack.push(e);
      return true;
    },
    removeItem(s, item) {
      calls.push({ op: 'removeItem', side: s.id, item });
      const a = acct(s);
      const i = a.pack.findIndex((p) => p.item === item);
      return i < 0 ? null : a.pack.splice(i, 1)[0]!;
    },
    packWeight: (s) => acct(s).pack.reduce((n, p) => n + p.weight, 0),
    pot: (s, share) => Math.floor(acct(s).purse * share),
    haul: (s) => acct(s).purse - acct(s).startPurse,
    sides: () => [...accts.values()].map((a) => a.side),
  };
}

export interface Harness {
  sim: Sim;
  ledger: FakeLedger;
  ctx(inputs?: Map<string, PlayerInput>): StepContext;
  char(id: EntityId): Character;
  /** An NPC copy of a player character at (x, y). */
  npc(x: number, y: number): Character;
  /** Runs one system alone, then advances the tick (events of that step stay readable). */
  run(system: (ctx: StepContext) => void, n?: number): void;
  events(): SimEvent[];
}

/** A play-phase sim: `players` player characters (ids 1..n), no NPCs, no guards, a fake ledger. */
export function harness(players = 2): Harness {
  const sim = quietSim(1, players);
  sim.step(); // places the starting guards; tests then place their own
  sim.world.guards.length = 0;
  sim.world.events.length = 0;
  const ledger = fakeLedger();
  attachLedger(sim.world, ledger);
  const w = sim.world;
  const h: Harness = {
    sim,
    ledger,
    ctx: (inputs) => ({ ...sim.context(), ...(inputs ? { inputs } : {}) }),
    char: (id) => w.characters.find((c) => c.id === id)!,
    npc(x, y) {
      const base = w.characters[0]!;
      const c: Character = {
        ...base,
        id: w.nextId++,
        x,
        y,
        control: { k: 'npc' },
        side: null,
        activity: { k: 'free' },
      };
      w.characters.push(c);
      return c;
    },
    run(system, n = 1) {
      for (let i = 0; i < n; i++) {
        w.events.length = 0;
        system(h.ctx());
        w.tick += 1;
      }
    },
    events: () => w.events,
  };
  return h;
}

export function place(
  c: { x: number; y: number; facing: number },
  x: number,
  y: number,
  facing = 0,
) {
  c.x = x;
  c.y = y;
  c.facing = facing;
}

let holdIds = 10_000;
/** A live PICKPOCKET-style hold on `actor` (mid-steal), outside the hold machine. */
export function midSteal(h: Harness, actor: Character): Hold {
  const w = h.sim.world;
  const hold: Hold = {
    id: holdIds++,
    kind: 'pickpocket',
    actor: actor.id,
    target: { k: 'pocket', victim: actor.id },
    startTick: w.tick,
    endTick: w.tick + 1000,
    result: null,
  };
  w.holds.push(hold);
  actor.activity = { k: 'holding', hold: hold.id };
  return hold;
}

export const tvEvents = (h: Harness) => h.events().filter((e) => e.ch === 'tv');
export const DOWN = Math.PI / 2;
export const UP = -Math.PI / 2;
