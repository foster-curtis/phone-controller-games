// Host wiring (SPEC §6.6, §6.8, §7.4, §8): relay client ↔ match reducer ↔ TV view. Phone messages and
// timers become match events; the match's effects become sends, timers, the sessionStorage snapshot
// and object-URL revokes. Photo chunks go through the blob receiver, which acks each finished photo.
// The TV re-renders after every change (and on a countdown tick); sounds play at the §6.8 moments.
import type { HostRoom, PeerChange } from '@pcg/net-client';
import { createBlobReceiver, type ReceivedPhoto } from '../shared/blob-transfer';
import type { HostMsg } from '../shared/messages';
import { noopSfx, type Sfx } from '../shared/sfx';
import { PERSIST_KEY } from './match/config';
import {
  createMatch,
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
  /** Host-refresh snapshot target (SPEC §6.3); null = don't persist. Default `sessionStorage`. */
  storage?: Pick<Storage, 'setItem'> | null;
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

  const match = createMatch({ rng: opts.rng ?? Math.random, now: () => timers.now() });

  const receiver = createBlobReceiver({
    onComplete: onPhoto,
    sendAck: (to, ack) => send(ack, to),
    ...(opts.createUrl ? { createUrl: opts.createUrl } : {}),
    revokeUrl,
  });

  let view: TvView = match.tvView();
  let painted = '';
  /** Last scatter second that beeped (3, 2, 1). */
  let beeped = 0;
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
    if (next.phase === 'scatter') {
      const s = Math.ceil(next.endsInMs / 1000);
      if (s >= 1 && s <= 3 && s !== beeped) {
        beeped = s;
        sfx.play(s === 1 ? 'beepFinal' : 'beep');
      }
    } else {
      beeped = 0;
    }
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

  function onRoom(room: HostRoom): void {
    dispatch({ type: 'room', code: room.code });
    // A reclaim lists the phones still in the room.
    for (const p of room.roster) {
      onPeer({
        event: p.connected ? 'joined' : 'left',
        playerId: p.playerId,
        playerKey: p.playerKey,
      });
    }
  }

  const detach = attachHostClient(client, {
    msg: (from, msg) => dispatch({ type: 'msg', from, msg }),
    chunk: (from, chunk) => receiver.receive(from, chunk),
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
    match,
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
