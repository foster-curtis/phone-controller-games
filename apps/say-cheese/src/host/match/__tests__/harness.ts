// Test harness for the match state machine (SPEC §8): drives events and keeps a fake clock.
import { rngStream } from '@pcg/game-kit';
import type { PhoneMsg } from '../../../shared/messages';
import type { SeatId } from '../../../shared/seats';
import { createMatch, type MatchOptions } from '../match';
import type { Effect, HostControl, MatchEvent, PersistedMatch, TimerId } from '../types';

export function setup(opts: { seed?: number; restored?: PersistedMatch } = {}) {
  let t = 1000;
  const options: MatchOptions = {
    rng: rngStream(opts.seed ?? 1, 'queue').next,
    now: () => t,
    ...(opts.restored ? { restored: opts.restored } : {}),
  };
  const m = createMatch(options);
  let last: Effect[] = [];
  const d = (e: MatchEvent): Effect[] => (last = m.dispatch(e));
  const msg = (from: string, body: PhoneMsg) => d({ type: 'msg', from, msg: body });
  const ctl = (action: Exclude<HostControl['action'], 'remove'>) =>
    d({ type: 'control', control: { action } });
  const remove = (playerId: SeatId) =>
    d({ type: 'control', control: { action: 'remove', playerId } });
  const timer = (id: TimerId) => d({ type: 'timer', timer: id });
  const connect = (id: string) =>
    d({ type: 'peer', event: 'joined', playerId: id, playerKey: `k-${id}` });
  const disconnect = (id: string) =>
    d({ type: 'peer', event: 'left', playerId: id, playerKey: '' });
  const rejoin = (id: string) =>
    d({ type: 'peer', event: 'rejoined', playerId: id, playerKey: `k-${id}` });

  /** A phone joins with one player; camera and ready default on. */
  function join(id: string, name = id, o: { camera?: boolean | null; ready?: boolean } = {}) {
    connect(id);
    msg(id, { t: 'profile', seat: 0, name });
    if (o.camera !== null) msg(id, { t: 'camera', ok: o.camera ?? true });
    if (o.ready ?? true) msg(id, { t: 'ready', ready: true });
  }

  const photographer = () => {
    const id = m.state.round?.photographer;
    return m.state.players.find((p) => p.id === id)!;
  };
  /** The current round's photographer phone. */
  const phPhone = () => photographer().phoneId;

  /** From announce: I'm ready, scatter timer, shoot `n` photos (all arrive), end of shoot. */
  function shoot(n: number, o: { arrive?: number; done?: boolean } = {}) {
    const from = phPhone();
    const r = m.state.round!.r;
    msg(from, { t: 'shootReady' });
    timer('scatter');
    for (let i = 0; i < n; i++) msg(from, { t: 'shot', r, photo: i, at: i, aspect: 0.75 });
    for (let i = 0; i < (o.arrive ?? n); i++)
      d({ type: 'photo', r, photo: i, url: `blob:${r}/${i}` });
    if (o.done ?? true) msg(from, { t: 'shootDone', r, count: n });
  }

  /** From pass or announce through results with these tags (photo index → seat ids). */
  function playRound(tags: (SeatId | null)[][] = [], n = Math.max(1, tags.length)) {
    if (m.state.phase === 'pass') msg(phPhone(), { t: 'seatConfirm', seat: photographer().seat });
    shoot(n);
    const from = phPhone();
    tags.forEach((ids, photo) =>
      ids.forEach((playerId, k) =>
        msg(from, { t: 'tag', photo, tagId: `t${photo}-${k}`, x: 0.5, y: 0.5, playerId }),
      ),
    );
    msg(from, { t: 'finishReview' });
  }

  return {
    m,
    d,
    msg,
    ctl,
    remove,
    timer,
    connect,
    disconnect,
    rejoin,
    join,
    shoot,
    playRound,
    photographer,
    phPhone,
    last: () => last,
    advance: (ms: number) => (t += ms),
  };
}

/** `n` phones (`p1`…) with one player each, all ready with cameras. */
export function lobbyOf(n: number, seed?: number) {
  const h = setup(seed === undefined ? {} : { seed });
  for (let i = 1; i <= n; i++) h.join(`p${i}`, `P${i}`);
  return h;
}

/** Lobby of `n`, Start, rules skipped: the first round is up. */
export function started(n: number, seed?: number) {
  const h = lobbyOf(n, seed);
  h.msg('p1', { t: 'leader', action: 'start' });
  h.msg('p1', { t: 'leader', action: 'skip' });
  return h;
}
