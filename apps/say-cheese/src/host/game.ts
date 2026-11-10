// Host wiring (SPEC §6.6, §6.8, §7.4, §8): relay client ↔ match reducer ↔ TV view. Phone messages and
// timers become match events; the match's effects become sends, timers, the sessionStorage snapshot
// and object-URL revokes. Photo chunks go through the blob receiver, which acks each finished photo.
// The TV re-renders after every change (and on a countdown tick); sounds play at the §6.8 moments.
// Host refresh (SPEC §6.3): the match comes back from the sessionStorage snapshot when the relay
// room is reclaimed, and starts fresh when it isn't. Chunks of a stale round or a finished upload are
// dropped before reassembly (BUILD_PLAN §8).
import type { HostRoom, PeerChange } from '@pcg/net-client';
import { createBlobReceiver, type ReceivedPhoto } from '../shared/blob-transfer';
import type { HostMsg } from '../shared/messages';
import { createCountdownBeeper } from '../shared/countdown';
import { noopSfx, type Sfx } from '../shared/sfx';
import type { Chunk } from '../shared/blob-transfer/types';
import { PERSIST_KEY } from './match/config';
import {
  createMatch,
  parsePersisted,
  type Effect,
  type HostControl,
  type Match,
  type MatchEvent,
  type TvView,
} from './match';
import { attachHostClient, type HostClientLike } from './net';
import type { HostTimers } from './timers';
import { renderTv } from './view';

/** Countdown repaint cadence on the TV (scatter / shoot). */
const TICK_MS = 250;

export interface HostGameOptions {
  client: HostClientLike;
  /** The TV root (`#tv`). */
  root: HTMLElement;
  /** Origin the lobby QR points phones at. */
  origin: string;
  timers: HostTimers;
  sfx?: Sfx;
  rng?: () => number;
  /**
   * Host-refresh snapshot store (SPEC §6.3): written on every change, read once at boot when it has
   * `getItem`. null = neither. Default `sessionStorage`.
   */
  storage?: (Pick<Storage, 'setItem'> & Partial<Pick<Storage, 'getItem'>>) | null;
  /** Default `URL.createObjectURL` / `URL.revokeObjectURL`. */
  createUrl?: (blob: Blob) => string;
  revokeUrl?: (url: string) => void;
  setInterval?: (cb: () => void, ms: number) => unknown;
  clearInterval?: (handle: unknown) => void;
}

export interface HostGame {
  readonly match: Match;
  dispatch(event: MatchEvent): void;
  control(control: HostControl): void;
  /** The view the TV shows now. */
  tv(): TvView;
  /** Tab visibility: hidden pauses the scatter / shoot / upload timers (SPEC §8). */
  setVisible(visible: boolean): void;
  dispose(): void;
}

/** A view's identity for repainting: countdowns compare in whole seconds. */
function viewKey(v: TvView): string {
  return JSON.stringify(v, (k, val: unknown) =>
    k === 'endsInMs' ? Math.ceil((val as number) / 1000) : val,
  );
}

export function createHostGame(opts: HostGameOptions): HostGame {
  const { client, root, timers } = opts;
  const sfx = opts.sfx ?? noopSfx;
  const storage = opts.storage === undefined ? (globalThis.sessionStorage ?? null) : opts.storage;
  const revokeUrl = opts.revokeUrl ?? ((u: string) => URL.revokeObjectURL(u));
  const setI = opts.setInterval ?? ((cb, ms) => globalThis.setInterval(cb, ms));
  const clearI =
    opts.clearInterval ??
    ((h) => globalThis.clearInterval(h as ReturnType<typeof globalThis.setInterval>));

  const rng = opts.rng ?? Math.random;
  const now = () => timers.now();
  let restored: ReturnType<typeof parsePersisted> = null;
  try {
    restored = parsePersisted(storage?.getItem?.(PERSIST_KEY) ?? null);
  } catch {
    /* storage blocked: start fresh */
  }
  let match: Match = createMatch({ rng, now, ...(restored ? { restored } : {}) });

  const receiver = createBlobReceiver({
    onComplete: onPhoto,
    sendAck: (to, ack) => send(ack, to),
    ...(opts.createUrl ? { createUrl: opts.createUrl } : {}),
    revokeUrl,
  });

  let view: TvView = match.tvView();
  let painted = '';
  /** Scatter beeps: one per second, 5…1 (SPEC §6.2, §6.8). */
  const beeper = createCountdownBeeper((name) => sfx.play(name));
  const controls = { emit: control, sfx, origin: opts.origin };

  function send(msg: HostMsg, to: string): void {
    client.send(msg, to);
  }

  function run(effects: Effect[]): void {
    for (const e of effects) {
      switch (e.type) {
        case 'screen':
          send({ t: 'screen', screen: e.screen }, e.to);
          break;
        case 'ack':
          send(e.ack, e.to);
          break;
        case 'kick':
          client.kick(e.to);
          break;
        case 'startTimer': {
          const timer = e.timer;
          timers.start(timer, e.ms, () => dispatch({ type: 'timer', timer }));
          break;
        }
        case 'clearTimer':
          timers.clear(e.timer);
          break;
        case 'persist':
          try {
            storage?.setItem(PERSIST_KEY, JSON.stringify(e.data));
          } catch {
            /* storage full or blocked: a refresh just starts over */
          }
          break;
        case 'releasePhotos':
          for (const url of e.urls) revokeUrl(url);
          break;
      }
    }
  }

  /** SPEC §6.8 moments, from what changed on the TV. */
  function sounds(prev: TvView, next: TvView): void {
    if (next.phase === 'scatter') beeper.tick(next.endsInMs);
    else beeper.reset();
    if (next.phase === 'shoot') {
      if (prev.phase !== 'shoot') sfx.play('startBuzz');
      else if (next.shots > prev.shots) sfx.play('shutter');
    } else if (prev.phase === 'shoot') {
      sfx.play('endBuzz');
    }
    if (
      next.phase === 'review' &&
      next.photo?.url &&
      (prev.phase !== 'review' || prev.photoIndex !== next.photoIndex)
    ) {
      sfx.play('develop');
    }
    if (next.phase === 'results' && prev.phase !== 'results') sfx.play('sting');
  }

  function paint(): void {
    const prev = view;
    view = match.tvView();
    sounds(prev, view);
    // Match end and Back to lobby: every photo is gone (SPEC §7.4).
    const over = view.phase === 'matchEnd' || view.phase === 'lobby';
    if (over && prev.phase !== view.phase) receiver.revokeAll();
    const key = viewKey(view);
    if (key === painted) return;
    painted = key;
    renderTv(root, view, controls);
  }

  function dispatch(event: MatchEvent): void {
    run(match.dispatch(event));
    paint();
  }

  function control(c: HostControl): void {
    dispatch({ type: 'control', control: c });
  }

  function onPhoto(p: ReceivedPhoto): void {
    // Only the photographer's phone uploads; anything else is dropped.
    const s = match.state;
    const ph = s.round ? s.players.find((q) => q.id === s.round!.photographer) : undefined;
    if (!ph || ph.phoneId !== p.sender) {
      revokeUrl(p.url);
      return;
    }
    dispatch({ type: 'photo', r: p.r, photo: p.photo, url: p.url });
  }

  function onPeer(c: PeerChange): void {
    if (c.event === 'left') receiver.discardFrom(c.playerId);
    dispatch({ type: 'peer', event: c.event, playerId: c.playerId, playerKey: c.playerKey });
  }

  /** A new room: the old phones are gone, so is any restored or running match. */
  function startFresh(): void {
    for (const t of ['scatter', 'shoot', 'upload'] as const) timers.clear(t);
    receiver.revokeAll();
    match = createMatch({ rng, now });
  }

  function onRoom(room: HostRoom): void {
    if (!room.reclaimed && (match.state.players.length > 0 || match.phoneIds().length > 0)) {
      startFresh();
    }
    dispatch({ type: 'room', code: room.code });
    // A reclaim lists the phones still in the room; any other phone the match knows has gone.
    const listed = new Set(room.roster.map((p) => p.playerId));
    for (const id of match.phoneIds()) {
      if (!listed.has(id)) onPeer({ event: 'left', playerId: id, playerKey: '' });
    }
    for (const p of room.roster) {
      onPeer({
        event: p.connected ? 'joined' : 'left',
        playerId: p.playerId,
        playerKey: p.playerKey,
      });
    }
  }

  /** Only the current round's photographer, while its photos can still count (SPEC §7.4). */
  function acceptsChunk(from: string, chunk: Chunk): boolean {
    const s = match.state;
    if (!s.round || chunk.r !== s.round.r) return false;
    if (s.phase !== 'shoot' && s.phase !== 'upload') return false;
    return s.players.some((p) => p.id === s.round!.photographer && p.phoneId === from);
  }

  const detach = attachHostClient(client, {
    msg: (from, msg) => dispatch({ type: 'msg', from, msg }),
    chunk: (from, chunk) => {
      if (acceptsChunk(from, chunk)) receiver.receive(from, chunk);
    },
    peer: onPeer,
    room: onRoom,
  });

  const ticker = setI(() => {
    if (!timers.paused && (view.phase === 'scatter' || view.phase === 'shoot')) paint();
  }, TICK_MS);

  run(match.flush());
  renderTv(root, view, controls);
  painted = viewKey(view);

  return {
    get match() {
      return match;
    },
    dispatch,
    control,
    tv: () => view,
    setVisible(visible) {
      timers.setPaused(!visible);
      if (visible) paint();
    },
    dispose() {
      detach();
      clearI(ticker);
      timers.dispose();
      receiver.revokeAll();
    },
  };
}
