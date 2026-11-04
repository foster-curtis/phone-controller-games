// Phone ↔ relay (SPEC §7.3, §7.4): `hello` with this phone's seats on every open, photos sent through
// the blob sender as they are taken (unacked ones again after a reconnect), `photoAck` handling, and
// the round bookkeeping that stops resending once the host has moved on (BUILD_PLAN §8).
import type { ControllerClient, Unsubscribe } from '@pcg/net-client';
import { createBlobSender, type BlobSender } from '../shared/blob-transfer';
import { isHostMsg, type HelloSeat, type HostMsg, type Screen } from '../shared/messages';
import type { CapturedPhoto } from './camera/types';
import type { PhotoStore } from './photos';

export type PhoneClientLike = Pick<ControllerClient, 'send' | 'onMessage' | 'onStatus'>;

export interface PhoneNetOptions {
  client: PhoneClientLike;
  /** Relay player key: seat 0's late-rejoin key (SPEC §7.3 `hello`). */
  playerKey: string;
  photos: PhotoStore;
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

export function createPhoneNet(opts: PhoneNetOptions): PhoneNet {
  const { client, photos } = opts;
  const sender = createBlobSender({ send: (chunk) => client.send(chunk) });
  /** This phone's seats as the host last reported them. */
  let seats: Screen['seats'] = [];
  let round = -1;

  const helloSeats = (): HelloSeat[] =>
    // Extra seats on a shared phone keep their own keys (SC7); seat 0 uses the relay key.
    seats
      .filter((s) => s.seat === 0)
      .map((s) => ({ seat: 0, seatKey: opts.playerKey, name: s.name }));

  function onScreen(screen: Screen): void {
    seats = screen.seats;
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
      sender.clear();
      photos.clear();
    },
  };
}
