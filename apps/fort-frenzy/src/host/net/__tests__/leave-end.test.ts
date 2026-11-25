// The pause menu's Leave game and End game (RD6-fix-1; SPEC §10.5, §11.1, §11.3, §15.6): a player who
// leaves frees their party slot (kicked, leadership passes, the knight stays dazed), the last one out
// ends the run, and only the leader can end the run for everyone (back to the lobby).
import { describe, expect, it } from 'vitest';
import type { HostClient } from '@pcg/net-client';
import {
  isIntent,
  PROTOCOL_VERSION,
  type AckReason,
  type HostMsg,
  type Intent,
  type MeView,
} from '../../../shared/messages';
import { createRuntime } from '../../game';
import { memorySnapshotStore } from '../resume';

function setup() {
  const clock = { t: 0 };
  const sent: { msg: HostMsg; to: string | undefined }[] = [];
  const kicked: string[] = [];
  const subs = {
    msg: [] as ((from: string, data: unknown) => void)[],
    peer: [] as ((c: {
      event: 'joined' | 'left' | 'rejoined';
      playerId: string;
      playerKey: string;
    }) => void)[],
  };
  const client = {
    status: 'open',
    code: 'ABCD',
    closeReason: null,
    start: () => Promise.resolve({ code: 'ABCD', reclaimed: false, roster: [] }),
    send: (data: unknown, to?: string) => sent.push({ msg: data as HostMsg, to }),
    lock: () => {},
    unlock: () => {},
    kick: (id: string) => kicked.push(id),
    close: () => {},
    onMessage: (cb: (from: string, data: unknown) => void) => (subs.msg.push(cb), () => {}),
    onPeer: (cb: (typeof subs.peer)[number]) => (subs.peer.push(cb), () => {}),
    onRoom: () => () => {},
    onStatus: () => () => {},
    onError: () => () => {},
  } as unknown as HostClient;
  const rt = createRuntime({
    client,
    origin: 'http://tv.test',
    seed: 7,
    store: memorySnapshotStore(),
    now: () => clock.t,
  });
  const message = (from: string, data: unknown) => subs.msg.forEach((cb) => cb(from, data));
  let seq = 0;
  const intent = (id: string, i: Intent): number => {
    message(id, { t: 'intent', seq: ++seq, intent: i });
    return seq;
  };
  const ackOf = (n: number) =>
    sent.find((x) => x.msg.t === 'ack' && x.msg.seq === n)?.msg as
      { ok: boolean; reason?: AckReason } | undefined;
  const join = (id: string, name: string) => {
    subs.peer.forEach((cb) => cb({ event: 'joined', playerId: id, playerKey: `key-${id}` }));
    message(id, { t: 'hello', proto: PROTOCOL_VERSION, deviceId: `dev-${id}` });
    intent(id, { k: 'name', name });
    intent(id, { k: 'class', classId: 'ranger' });
  };
  const run = (ms: number) => {
    for (let i = 0; i < ms; i += 50) {
      clock.t += 50;
      rt.tick(50);
    }
  };
  const until = (phase: string) => {
    for (let i = 0; i < 2000 && rt.world?.phase !== phase; i++) run(50);
    expect(rt.world?.phase).toBe(phase);
  };
  const lastMe = (id: string): MeView =>
    (sent.filter((x) => x.msg.t === 'me' && x.to === id).at(-1)!.msg as { me: MeView }).me;
  return { rt, kicked, intent, ackOf, join, run, until, lastMe };
}

/** `ids` join and ready up; the run reaches combat, paused by the first player. */
function pausedRun(ids: string[]) {
  const env = setup();
  for (const id of ids) env.join(id, id.toUpperCase());
  for (const id of ids) env.intent(id, { k: 'ready', ready: true });
  env.until('build');
  for (const id of ids) env.intent(id, { k: 'ready', ready: true });
  env.until('combat');
  env.intent(ids[0]!, { k: 'pause', paused: true });
  env.run(100);
  expect(env.rt.paused).not.toBeNull();
  return env;
}

describe('pause menu messages (RD6-fix-1)', () => {
  it('leave and the leader`s endGame pass the guard', () => {
    expect(isIntent({ k: 'leave' })).toBe(true);
    expect(isIntent({ k: 'leader', action: 'endGame' })).toBe(true);
    expect(isIntent({ k: 'leader', action: 'endgame' })).toBe(false);
  });
});

describe('End game (RD6-fix-1)', () => {
  it('from a non-leader is refused and the run goes on', () => {
    const env = pausedRun(['a', 'b']);
    const sim = env.rt.session.sim;
    const n = env.intent('b', { k: 'leader', action: 'endGame' });
    expect(env.ackOf(n)).toMatchObject({ ok: false, reason: 'notLeader' });
    expect(env.rt.session.sim).toBe(sim);
    expect(env.rt.world?.phase).toBe('combat');
  });

  it('from the leader ends the run for everyone: the lobby, knights kept, nobody kicked', () => {
    const env = pausedRun(['a', 'b']);
    const n = env.intent('a', { k: 'leader', action: 'endGame' });
    expect(env.ackOf(n)).toMatchObject({ ok: true });
    expect(env.rt.session.sim).toBeNull();
    expect(env.rt.paused).toBeNull();
    expect(env.rt.session.party.stage).toBe('lobby');
    expect(env.kicked).toEqual([]);
    env.run(300);
    for (const id of ['a', 'b']) {
      expect(env.lastMe(id)).toMatchObject({ screen: 'lobby', classId: 'ranger', ready: false });
    }
  });

  it('outside a run it acks `phase`', () => {
    const env = setup();
    env.join('a', 'Ann');
    const n = env.intent('a', { k: 'leader', action: 'endGame' });
    expect(env.ackOf(n)).toMatchObject({ ok: false, reason: 'phase' });
  });
});

describe('Leave game (RD6-fix-1)', () => {
  it('frees the slot: the phone is kicked, the member goes, the knight stays dazed', () => {
    const env = pausedRun(['a', 'b', 'c']);
    const slot = env.rt.session.party.member('b')!.slot!;
    const n = env.intent('b', { k: 'leave' });
    expect(env.ackOf(n)).toMatchObject({ ok: true });
    expect(env.kicked).toEqual(['b']);
    expect(env.rt.session.party.member('b')).toBeNull();
    expect(env.rt.session.party.members).toHaveLength(2);
    // The run goes on (still paused); after the resume the knight is dazed for good.
    env.intent('a', { k: 'pause', paused: false });
    env.run(200);
    expect(env.rt.world?.players.find((p) => p.slot === slot)?.connected).toBe(false);
    expect(env.rt.session.sim).not.toBeNull();
  });

  it('the leader leaving passes leadership on', () => {
    const env = pausedRun(['a', 'b']);
    expect(env.rt.session.party.leaderId).toBe('a');
    env.intent('a', { k: 'leave' });
    expect(env.rt.session.party.leaderId).toBe('b');
    env.run(300);
    expect(env.lastMe('b').isLeader).toBe(true);
  });

  it('the last player out ends the run', () => {
    const env = pausedRun(['a']);
    env.intent('a', { k: 'leave' });
    expect(env.kicked).toEqual(['a']);
    expect(env.rt.session.sim).toBeNull();
    expect(env.rt.session.party.members).toHaveLength(0);
  });

  it('outside a run it acks `phase` and nobody is kicked', () => {
    const env = setup();
    env.join('a', 'Ann');
    const n = env.intent('a', { k: 'leave' });
    expect(env.ackOf(n)).toMatchObject({ ok: false, reason: 'phase' });
    expect(env.kicked).toEqual([]);
    expect(env.rt.session.party.member('a')).not.toBeNull();
  });
});
