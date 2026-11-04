// HostClient ↔ host game (SPEC §7.1, §7.3, §7.4): relay messages are checked with `isPhoneMsg` and
// split into photo chunks (blob receiver) and match messages; peers and the room code go to the
// match. Sending is `client.send(HostMsg, to)`.
import type { HostClient, HostRoom, PeerChange, Unsubscribe } from '@pcg/net-client';
import type { Chunk } from '../shared/blob-transfer/types';
import { isPhoneMsg, type HostMsg, type PhoneMsg } from '../shared/messages';

/** The slice of HostClient the wiring uses (tests pass a fake). */
export type HostClientLike = Pick<
  HostClient,
  'code' | 'send' | 'kick' | 'onMessage' | 'onPeer' | 'onRoom' | 'onStatus'
>;

export interface HostNetHandlers {
  msg(from: string, msg: Exclude<PhoneMsg, Chunk>): void;
  chunk(from: string, chunk: Chunk): void;
  peer(change: PeerChange): void;
  room(room: HostRoom): void;
}

/** Subscribes `handlers` to `client`; anything that isn't a valid phone message is dropped. */
export function attachHostClient(client: HostClientLike, handlers: HostNetHandlers): Unsubscribe {
  const offs = [
    client.onMessage((from, data) => {
      if (!isPhoneMsg(data)) return;
      if (data.t === 'chunk') handlers.chunk(from, data);
      else handlers.msg(from, data);
    }),
    client.onPeer((change) => handlers.peer(change)),
    client.onRoom((room) => handlers.room(room)),
  ];
  return () => offs.forEach((off) => off());
}

export function sendHostMsg(client: Pick<HostClient, 'send'>, msg: HostMsg, to: string): void {
  client.send(msg, to);
}
