// Phone ↔ relay (SPEC §7.3, §7.4): `hello` with this phone's seats on every open, photos sent through
// the blob sender as they are taken (unacked ones again after a reconnect), `photoAck` handling, and
// the round bookkeeping that stops resending once the host has moved on (BUILD_PLAN §8).
// Late rejoin (SPEC §6.3, §6.3.1): `hello` lists every seat this phone keeps a key for (seat 0 = the
// relay player key, the others from the seat-key store), so the host restores all of them. The Leave
// game / Remove a player menu (screens/leave.ts) mounts here, over every screen.
import type { ControllerClient, Unsubscribe } from '@pcg/net-client';
import { createBlobSender, type BlobSender } from '../shared/blob-transfer';
import { isHostMsg, type HelloSeat, type HostMsg, type Screen } from '../shared/messages';
import { createSeatKeyStore, type SeatKeyStore } from '../shared/seats';
import type { CapturedPhoto } from './camera/types';
import type { PhotoStore } from './photos';
import { createLeaveMenu, type LeaveMenu } from './screens/leave';

export type PhoneClientLike = Pick<ControllerClient, 'send' | 'onMessage' | 'onStatus'>;

export interface PhoneNetOptions {
  client: PhoneClientLike;
  /** Relay player key: seat 0's late-rejoin key (SPEC §7.3 `hello`). */
  playerKey: string;
  photos: PhotoStore;
  /**
   * This phone's extra-seat keys for the room (SC7 saves them). Default: `localStorage`, scoped to
   * the page's `?code=`.
   */
  seatKeys?: SeatKeyStore;
  /**
   * Where the Leave / Remove menu mounts, looked up on the first screen (after the app shell has
   * rendered). Default `#app`; null = no menu.
   */
  menuRoot?: (() => HTMLElement | null) | null;
}

export interface PhoneNet {
  readonly sender: BlobSender;
  /** `AppOptions.onCapture`: keep the photo locally and start uploading it. */
  onCapture(r: number, photo: number, captured: CapturedPhoto): void;
  /** `AppOptions.onHostMsg`. */
  onHostMsg(msg: HostMsg): void;
  /** The seats `hello` reports now. */
  helloSeats(): HelloSeat[];
  dispose(): void;
}

/** Screens that belong to round `r` and still accept its photos. */
const UPLOADING: ReadonlySet<Screen['kind']> = new Set(['scatter', 'shoot', 'upload']);

function defaultSeatKeys(): SeatKeyStore | undefined {
  if (typeof location === 'undefined') return undefined;
  const code = new URLSearchParams(location.search).get('code')?.trim().toUpperCase();
  if (!code) return undefined;
  let storage: Storage | undefined;
  try {
    storage = globalThis.localStorage;
  } catch {
    storage = undefined; // blocked: extra seats just aren't restored
  }
  return createSeatKeyStore(storage, code);
}

const defaultMenuRoot = (): HTMLElement | null =>
  typeof document === 'undefined' ? null : document.getElementById('app');

export function createPhoneNet(opts: PhoneNetOptions): PhoneNet {
  const { client, photos } = opts;
  const seatKeys = opts.seatKeys ?? defaultSeatKeys();
  const menuRoot = opts.menuRoot === undefined ? defaultMenuRoot : opts.menuRoot;
  const sender = createBlobSender({ send: (chunk) => client.send(chunk) });
  /** This phone's seats as the host last reported them. */
  let seats: Screen['seats'] = [];
  let round = -1;
  let menu: LeaveMenu | null = null;

  /** Seat 0 (once named) with the relay key, then every stored extra seat (SC7) with its own key. */
  function helloSeats(): HelloSeat[] {
    const out: HelloSeat[] = seats
      .filter((s) => s.seat === 0)
      .map((s) => ({ seat: 0, seatKey: opts.playerKey, name: s.name }));
    for (const s of seatKeys?.load() ?? []) {
      if (s.seat > 0 && !out.some((o) => o.seat === s.seat)) out.push({ ...s });
    }
    return out;
  }

  function mountMenu(): void {
    if (menu || !menuRoot) return;
    const root = menuRoot();
    if (!root) return;
    menu = createLeaveMenu({
      send: (m) => client.send(m),
      ...(seatKeys ? { seatKeys } : {}),
    });
    root.append(menu.el);
  }

  function onScreen(screen: Screen): void {
    seats = screen.seats;
    mountMenu();
    menu?.update(screen);
    if (!('r' in screen)) return;
    if (screen.r !== round) {
      sender.dropRound(round);
      photos.keepOnly(screen.r);
      round = screen.r;
    }
    // Review or results: the host moved on with whatever arrived.
    if (!UPLOADING.has(screen.kind)) sender.dropRound(screen.r);
  }

  let opened = false;
  const offs: Unsubscribe[] = [
    client.onMessage((d) => {
      if (isHostMsg(d) && d.t === 'screen') onScreen(d.screen);
    }),
    client.onStatus((status) => {
      if (status !== 'open') return;
      client.send({ t: 'hello', seats: helloSeats() });
      // Under the same or a new relay id (late rejoin by key), the host takes them from chunk 0.
      if (opened) sender.resendUnacked();
      opened = true;
    }),
  ];

  return {
    sender,
    onCapture(r, photo, captured) {
      photos.put(r, photo, captured.blob);
      void sender.add(r, photo, captured.blob).catch(() => {
        /* encode failed: the host's upload grace moves on without it */
      });
    },
    onHostMsg(msg) {
      if (msg.t === 'photoAck') sender.ack(msg);
    },
    helloSeats,
    dispose() {
      offs.forEach((off) => off());
      menu?.destroy();
      sender.clear();
      photos.clear();
    },
  };
}
