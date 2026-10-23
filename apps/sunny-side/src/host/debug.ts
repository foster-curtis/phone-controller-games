// Debug hooks (`window.__pcg`), enabled only in dev or with `?debug=1` (Build decisions).
// `debug.eliminate(id)` drives a real ring-out through the sim (outward stick + a dash), so the
// match sees a genuine `eliminated` event and the sim's own ghost spawn follows.
import type { InputTuple } from '../shared/messages';
import type { MatchPhase, MatchView, PlayerView } from './match';
import type { Sim, SimPlayerId } from './sim';
import { BUTTON_SLAM, STICK_MAX } from '../shared/messages';

export function debugEnabled(
  dev: boolean = import.meta.env.DEV,
  search: string = globalThis.location?.search ?? '',
): boolean {
  return dev || new URLSearchParams(search).get('debug') === '1';
}

export interface DebugSim extends Sim {
  /** Steer this egg straight out of the arena (with a dash) until it rings out. */
  forceOut(id: SimPlayerId): boolean;
  /**
   * Real credited knockout: the attacker dashes at the (frozen) victim until they collide, then the
   * victim is forced out, so the last-touch credit is genuine. false if either has no egg.
   */
  knockOut(victim: SimPlayerId, attacker: SimPlayerId): boolean;
  /** Hold (or release) the slam button for this egg. */
  holdSlam(id: SimPlayerId, on: boolean): boolean;
}

/** Wraps a Sim; while an egg is being forced out, its player's real inputs are held back. */
export function createDebugSim(inner: Sim): DebugSim {
  const lastInput = new Map<SimPlayerId, InputTuple | null>();
  /** id → steps forced so far + the counters to send. */
  const forced = new Map<SimPlayerId, { steps: number; dash: number; slam: number }>();

  const chases = new Map<
    SimPlayerId,
    { attacker: SimPlayerId; steps: number; dash: number; slam: number }
  >();
  const holds = new Map<SimPlayerId, { slam: number }>();
  const isHeld = (id: SimPlayerId) =>
    forced.has(id) || holds.has(id) || [...chases.values()].some((c) => c.attacker === id);

  const release = (id: SimPlayerId) => {
    forced.delete(id);
    inner.setInput(id, lastInput.get(id) ?? null);
  };

  return {
    startRound(eggs) {
      forced.clear();
      chases.clear();
      holds.clear();
      inner.startRound(eggs);
    },
    setFrozen: (id, frozen) => inner.setFrozen(id, frozen),
    setInput(id, input) {
      lastInput.set(id, input);
      if (!isHeld(id)) inner.setInput(id, input);
    },
    step() {
      for (const [id, h] of holds) {
        if (!inner.snapshot().eggs.some((e) => e.id === id)) holds.delete(id);
        else inner.setInput(id, [0, 0, BUTTON_SLAM, lastInput.get(id)?.[3] ?? 0, h.slam]);
      }
      for (const [victim, c] of chases) {
        const eggs = inner.snapshot().eggs;
        const v = eggs.find((e) => e.id === victim);
        const a = eggs.find((e) => e.id === c.attacker);
        if (!v || !a) {
          chases.delete(victim);
          inner.setInput(c.attacker, lastInput.get(c.attacker) ?? null);
          continue;
        }
        const len = Math.hypot(v.x - a.x, v.y - a.y) || 1;
        const dash = c.dash + 1 + Math.floor(c.steps / 45);
        inner.setInput(c.attacker, [
          Math.round(((v.x - a.x) / len) * STICK_MAX),
          Math.round(((v.y - a.y) / len) * STICK_MAX),
          0,
          c.steps === 0 ? c.dash : dash,
          c.slam,
        ]);
        c.steps++;
      }
      if (forced.size > 0) {
        const eggs = inner.snapshot().eggs;
        for (const [id, f] of forced) {
          const egg = eggs.find((e) => e.id === id);
          if (!egg) {
            release(id);
            continue;
          }
          const len = Math.hypot(egg.x, egg.y);
          const [dx, dy] = len > 1e-3 ? [egg.x / len, egg.y / len] : [1, 0];
          // Step 0 re-baselines the press counters; the +1 from step 1 on is one dash.
          const dash = f.steps === 0 ? f.dash : f.dash + 1;
          inner.setInput(id, [
            Math.round(dx * STICK_MAX),
            Math.round(dy * STICK_MAX),
            0,
            dash,
            f.slam,
          ]);
          f.steps++;
        }
      }
      const events = inner.step();
      for (const e of events) {
        if (e.type !== 'collision') continue;
        for (const [victim, c] of chases) {
          if ((e.a === victim && e.b === c.attacker) || (e.b === victim && e.a === c.attacker)) {
            chases.delete(victim);
            inner.setInput(c.attacker, lastInput.get(c.attacker) ?? null);
            inner.setFrozen(victim, false);
            const last = lastInput.get(victim);
            forced.set(victim, { steps: 0, dash: last?.[3] ?? 0, slam: last?.[4] ?? 0 });
          }
        }
      }
      return events;
    },
    snapshot: () => inner.snapshot(),
    destroy: () => inner.destroy(),
    forceOut(id) {
      if (!inner.snapshot().eggs.some((e) => e.id === id)) return false;
      const last = lastInput.get(id);
      forced.set(id, { steps: 0, dash: last?.[3] ?? 0, slam: last?.[4] ?? 0 });
      return true;
    },
    knockOut(victim, attacker) {
      const eggs = inner.snapshot().eggs;
      if (!eggs.some((e) => e.id === victim) || !eggs.some((e) => e.id === attacker)) return false;
      inner.setFrozen(victim, true);
      const last = lastInput.get(attacker);
      chases.set(victim, { attacker, steps: 0, dash: last?.[3] ?? 0, slam: last?.[4] ?? 0 });
      return true;
    },
    holdSlam(id, on) {
      if (!on) {
        holds.delete(id);
        inner.setInput(id, lastInput.get(id) ?? null);
        return true;
      }
      if (!inner.snapshot().eggs.some((e) => e.id === id)) return false;
      holds.set(id, { slam: (lastInput.get(id)?.[4] ?? 0) + 1 });
      return true;
    },
  };
}

export interface PcgDebugApi {
  phase(): MatchPhase;
  players(): PlayerView[];
  view(): MatchView;
  /** Room code, or null before the relay answered. */
  code(): string | null;
  /** The URL the lobby QR encodes (`${origin}/play?code=CODE`). */
  joinUrl(): string | null;
  /** The QR modules actually drawn (row-major, 1 = dark), or null before the lobby drew one. */
  qr(): { size: number; modules: number[] } | null;
  /** Text currently shown by the active Phaser scenes. */
  texts(): string[];
  debug: {
    /** Ring-out this player's egg for real (sim-driven). false if they have no egg on the pan. */
    eliminate(id: string): boolean;
    /** Credited knockout of `victim` by `attacker` (real collision, then ring-out). */
    knockOut(victim: string, attacker: string): boolean;
    /** Hold or release SLAM for this player's egg. */
    holdSlam(id: string, on: boolean): boolean;
  };
}

declare global {
  interface Window {
    __pcg?: PcgDebugApi;
  }
}

export function installDebug(api: PcgDebugApi, target: Window = window): void {
  target.__pcg = api;
}
