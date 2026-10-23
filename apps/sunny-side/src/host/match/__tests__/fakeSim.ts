// Test doubles for match tests: a recording FakeSim, in-memory storage, and a loop-like harness.
import type { InputTuple, Screen, ScreenKind } from '../../../shared/messages';
import type { EggSpawn, Sim, SimEvent, SimSnapshot } from '../../sim/types';
import { STEP_MS } from '../config';
import { createMatch } from '../index';
import type { Match, MatchEvent, StorageLike } from '../types';

export class FakeSim implements Sim {
  /** Spawn lists passed to each `startRound`. */
  rounds: EggSpawn[][] = [];
  /** Current frozen flag per egg on the pan. */
  frozen = new Map<string, boolean>();
  inputs = new Map<string, InputTuple | null>();
  frozenCalls: [string, boolean][] = [];
  inputCalls: [string, InputTuple | null][] = [];
  steps = 0;
  private pending: SimEvent[] = [];

  startRound(eggs: readonly EggSpawn[]): void {
    this.rounds.push(eggs.map((e) => ({ ...e })));
    this.frozen = new Map(eggs.map((e) => [e.id, e.frozen]));
    this.inputs.clear();
  }
  setFrozen(id: string, frozen: boolean): void {
    this.frozenCalls.push([id, frozen]);
    if (this.frozen.has(id)) this.frozen.set(id, frozen);
  }
  setInput(id: string, input: InputTuple | null): void {
    this.inputCalls.push([id, input]);
    this.inputs.set(id, input);
  }
  /** Events returned by the next `step()`. */
  queue(...events: SimEvent[]): void {
    this.pending.push(...events);
  }
  step(): SimEvent[] {
    this.steps += 1;
    const out = this.pending;
    this.pending = [];
    for (const e of out) if (e.type === 'eliminated') this.frozen.delete(e.id);
    return out;
  }
  snapshot(): SimSnapshot {
    return {
      tick: this.steps,
      arena: { radius: 400, startRadius: 400, shrinking: false },
      eggs: [],
      ghosts: [],
    };
  }
  destroy(): void {}
  get lastRound(): EggSpawn[] {
    return this.rounds[this.rounds.length - 1] ?? [];
  }
}

export class MemStorage implements StorageLike {
  data = new Map<string, string>();
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
  removeItem(key: string): void {
    this.data.delete(key);
  }
}

export interface Sent {
  to: string | undefined;
  screen: Screen;
}

export type Harness = ReturnType<typeof setup>;

export function setup(storage: StorageLike = new MemStorage()) {
  const sim = new FakeSim();
  const sent: Sent[] = [];
  const kicks: string[] = [];
  const events: MatchEvent[] = [];
  const match: Match = createMatch({
    sim,
    send: (msg, to) => sent.push({ to, screen: msg.screen }),
    kick: (id) => kicks.push(id),
    storage,
  });
  match.onEvent((e) => events.push(e));

  const h = {
    sim,
    match,
    sent,
    kicks,
    events,
    storage,
    join(id: string, key = `key-${id}`) {
      match.playerJoined(id, key);
    },
    /** All screens sent to `id`, oldest first. */
    screensOf(id: string): Screen[] {
      return sent.filter((s) => s.to === id).map((s) => s.screen);
    },
    last(id: string): Screen {
      const all = h.screensOf(id);
      const s = all[all.length - 1];
      if (!s) throw new Error(`no screen sent to ${id}`);
      return s;
    },
    kinds(id: string): ScreenKind[] {
      return h.screensOf(id).map((s) => s.kind);
    },
    msg(from: string, data: unknown) {
      match.handleMessage(from, data);
    },
    /** One loop frame per step: sim steps only while `simRunning`, then match ticks. */
    step(n = 1) {
      for (let i = 0; i < n; i++) {
        if (match.simRunning) match.handleSimEvents(sim.step());
        match.tick(STEP_MS);
      }
    },
    runMs(ms: number) {
      h.step(Math.round(ms / STEP_MS));
    },
    /** Join each id (first = leader), Start from the host, run out the countdown. */
    startGame(ids: string[]) {
      for (const id of ids) h.join(id);
      match.hostAction('start');
      h.runMs(3000);
    },
    /** Queue an elimination and run one step. */
    eliminate(id: string, by: string | null = null, respawnMs = 5000) {
      sim.queue({ type: 'eliminated', id, by, respawnMs });
      h.step();
    },
    score(id: string): number {
      return match.view().players.find((p) => p.id === id)?.score ?? NaN;
    },
  };
  return h;
}
