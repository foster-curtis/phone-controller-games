// A fake relay host client for runtime tests (SPEC §12.5): records sends and lets a test act as phones.
import type { HostClient, PeerChange } from '@pcg/net-client';

export interface FakeHost {
  client: HostClient;
  sent: { to: string | undefined; data: unknown }[];
  /** A phone's message arriving from `from`. */
  msg(from: string, data: unknown): void;
  join(from: string, name: string): void;
  peer(change: Pick<PeerChange, 'event' | 'playerId'>): void;
}

export function fakeHostClient(code = 'ABCD'): FakeHost {
  const onMsg: ((from: string, data: unknown) => void)[] = [];
  const onPeer: ((c: PeerChange) => void)[] = [];
  const sent: FakeHost['sent'] = [];
  const off = () => () => {};
  const client = {
    status: 'open',
    code,
    closeReason: null,
    start: () => Promise.resolve({ code, reclaimed: false, roster: [] }),
    send: (data: unknown, to?: string) => void sent.push({ to, data }),
    lock() {},
    unlock() {},
    kick() {},
    close() {},
    onMessage: (cb: (from: string, data: unknown) => void) => (onMsg.push(cb), off()),
    onPeer: (cb: (c: PeerChange) => void) => (onPeer.push(cb), off()),
    onRoom: off,
    onStatus: off,
    onError: off,
    getStats: () => ({}) as ReturnType<HostClient['getStats']>,
  } as unknown as HostClient;
  const msg = (from: string, data: unknown) => {
    for (const cb of onMsg) cb(from, data);
  };
  return {
    client,
    sent,
    msg,
    join: (from, name) => msg(from, { t: 'join', name, proto: 1 }),
    peer: (c) => {
      for (const cb of onPeer) cb({ ...c, playerKey: 'k' });
    },
  };
}
