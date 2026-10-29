// Phone-side state from the host's `team` / `me` snapshots (SPEC §15.6): full snapshots with an
// increasing `rev`; an older (or equal) one is dropped. Intents carry a `seq` and the host answers with
// `ack`; a refusal becomes a toast.
import type { AckReason, HostMsg, Intent, MeView, TeamView } from '../shared/messages';

export interface HostState {
  team: TeamView | null;
  me: MeView | null;
  teamRev: number;
  meRev: number;
}

export const INITIAL_STATE: HostState = { team: null, me: null, teamRev: -1, meRev: -1 };

export type Applied = 'team' | 'me' | null;

/** Applies a `team` / `me` message when its rev is newer; returns the new state and what changed. */
export function applyHostMsg(
  state: HostState,
  msg: HostMsg,
): { state: HostState; changed: Applied } {
  if (msg.t === 'team' && msg.rev > state.teamRev) {
    return { state: { ...state, team: msg.team, teamRev: msg.rev }, changed: 'team' };
  }
  if (msg.t === 'me' && msg.rev > state.meRev) {
    return { state: { ...state, me: msg.me, meRev: msg.rev }, changed: 'me' };
  }
  return { state, changed: null };
}

/** After a reconnect or a host reload the host's revs may restart: forget them (the host resends both). */
export function resetRevs(state: HostState): HostState {
  return { ...state, teamRev: -1, meRev: -1 };
}

export const ACK_TEXT: Record<AckReason, string> = {
  coins: 'Not enough coins',
  crates: 'Not enough cells',
  cap: "You can't carry any more",
  phase: 'Not right now',
  invalid: "Can't do that",
  notLeader: 'Only the party leader can do that',
  taken: 'Already taken',
};

export const ACK_FALLBACK = "That didn't work";

/** The toast for a refused intent (null when it succeeded). */
export function ackToast(ack: { ok: boolean; reason?: AckReason | undefined }): string | null {
  if (ack.ok) return null;
  return (ack.reason && ACK_TEXT[ack.reason]) || ACK_FALLBACK;
}

export interface IntentTracker {
  /** Sends `{ t: 'intent', seq, intent }` with the next seq. */
  send(intent: Intent): number;
  /** Handles an ack; returns the toast text for a refusal of an intent still pending. */
  ack(ack: { seq: number; ok: boolean; reason?: AckReason | undefined }): string | null;
  pending(): number;
}

export function createIntentTracker(post: (msg: unknown) => void): IntentTracker {
  let seq = 0;
  const pending = new Map<number, Intent>();
  return {
    send(intent) {
      const n = ++seq;
      pending.set(n, intent);
      // Bounded: intents the host never answers must not pile up.
      if (pending.size > 64) pending.delete(pending.keys().next().value as number);
      post({ t: 'intent', seq: n, intent });
      return n;
    },
    ack(a) {
      if (!pending.delete(a.seq)) return null;
      return ackToast(a);
    },
    pending: () => pending.size,
  };
}
