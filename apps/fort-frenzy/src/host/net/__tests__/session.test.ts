import { describe, expect, it } from 'vitest';
import {
  isMeView,
  PROTOCOL_VERSION,
  type HostMsg,
  type MeView,
  type TeamView,
} from '../../../shared/messages';
import { createSession, type Session } from '../session';

interface Sent {
  msg: HostMsg;
  to: string | undefined;
}

function setup() {
  let t = 0;
  const sent: Sent[] = [];
  const kicked: string[] = [];
  const s = createSession({
    send: (msg, to) => sent.push({ msg, to }),
    kick: (id) => kicked.push(id),
    now: () => t,
    seed: () => 7,
  });
  const clock = {
    advance(ms: number) {
      t += ms;
    },
  };
  return { s, sent, kicked, clock };
}

let seq = 0;
function join(s: Session, id: string, name: string) {
  s.handlePeer({ event: 'joined', playerId: id, playerKey: `key-${id}` });
  s.handleMessage(id, { t: 'hello', proto: PROTOCOL_VERSION, deviceId: `dev-${id}` });
  s.handleMessage(id, { t: 'intent', seq: ++seq, intent: { k: 'name', name } });
  s.handleMessage(id, { t: 'intent', seq: ++seq, intent: { k: 'class', classId: 'engineer' } });
}

const lastTeam = (sent: Sent[]): TeamView =>
  (sent.filter((x) => x.msg.t === 'team' && x.to === undefined).at(-1)!.msg as { team: TeamView })
    .team;

const lastMe = (sent: Sent[], to: string): MeView =>
  (sent.filter((x) => x.msg.t === 'me' && x.to === to).at(-1)!.msg as { me: MeView }).me;

const ackOf = (sent: Sent[], n: number) =>
  sent.find((x) => x.msg.t === 'ack' && x.msg.seq === n)?.msg as
    { ok: boolean; reason?: string } | undefined;

describe('session: hello and sync', () => {
  it('answers hello with full team and me snapshots', () => {
    const { s, sent } = setup();
    s.handlePeer({ event: 'joined', playerId: 'a', playerKey: 'ka' });
    s.handleMessage('a', { t: 'hello', proto: PROTOCOL_VERSION, deviceId: 'd' });
    expect(sent.map((x) => [x.msg.t, x.to])).toEqual([
      ['team', 'a'],
      ['me', 'a'],
    ]);
    expect(lastMe(sent, 'a').screen).toBe('name');
  });

  it('sends `outdated` to an older phone and flags a newer one', () => {
    const { s, sent } = setup();
    s.handleMessage('old', { t: 'hello', proto: PROTOCOL_VERSION - 1, deviceId: 'd' });
    expect(sent).toEqual([{ msg: { t: 'outdated', proto: PROTOCOL_VERSION }, to: 'old' }]);
    s.handleMessage('new', { t: 'hello', proto: PROTOCOL_VERSION + 1, deviceId: 'e' });
    expect(s.outdated).toBe(true);
  });

  it('throttles team broadcasts to 5 Hz and sends only on change', () => {
    const { s, sent, clock } = setup();
    join(s, 'a', 'Ann');
    clock.advance(1000);
    s.flush();
    const n = sent.filter((x) => x.msg.t === 'team' && x.to === undefined).length;
    expect(n).toBe(1);
    s.flush();
    clock.advance(250);
    s.flush(); // unchanged: nothing new
    expect(sent.filter((x) => x.msg.t === 'team' && x.to === undefined).length).toBe(1);
    join(s, 'b', 'Bob');
    s.flush(); // changed, and the last send was 250 ms ago
    expect(sent.filter((x) => x.msg.t === 'team' && x.to === undefined).length).toBe(2);
    s.handleMessage('b', { t: 'intent', seq: 900, intent: { k: 'name', name: 'Bobby' } });
    s.flush(); // changed but too soon
    expect(sent.filter((x) => x.msg.t === 'team' && x.to === undefined).length).toBe(2);
    clock.advance(200);
    s.flush();
    expect(sent.filter((x) => x.msg.t === 'team' && x.to === undefined).length).toBe(3);
  });
});

describe('session: color intent (FF2-fix-1, FF4-fix-2)', () => {
  it('a lobby color pick changes the player color in team; a taken color acks `taken`', () => {
    const { s, sent, clock } = setup();
    join(s, 'a', 'Ann');
    join(s, 'b', 'Bob');
    clock.advance(500);
    s.flush();
    const before = lastTeam(sent);
    expect(before.roster.map((r) => r.color)).toEqual(['cobalt', 'jade']);

    s.handleMessage('a', { t: 'intent', seq: 501, intent: { k: 'color', color: 'rose' } });
    expect(ackOf(sent, 501)).toEqual({ t: 'ack', seq: 501, ok: true });
    clock.advance(500);
    s.flush();
    expect(lastTeam(sent).roster.find((r) => r.playerId === 'a')!.color).toBe('rose');
    expect(lastMe(sent, 'a').color).toBe('rose');

    s.handleMessage('b', { t: 'intent', seq: 502, intent: { k: 'color', color: 'rose' } });
    expect(ackOf(sent, 502)).toEqual({ t: 'ack', seq: 502, ok: false, reason: 'taken' });
    clock.advance(500);
    s.flush();
    expect(lastTeam(sent).roster.find((r) => r.playerId === 'b')!.color).toBe('jade');
  });

  it('refuses a color while ready (`phase`)', () => {
    const { s, sent } = setup();
    join(s, 'a', 'Ann');
    s.handleMessage('a', { t: 'intent', seq: 601, intent: { k: 'ready', ready: true } });
    s.handleMessage('a', { t: 'intent', seq: 602, intent: { k: 'color', color: 'sky' } });
    expect(ackOf(sent, 602)).toMatchObject({ ok: false, reason: 'phase' });
  });
});

describe('session: run', () => {
  it('starts when everyone is ready, routes intents to sim commands and acks after the step', () => {
    const { s, sent } = setup();
    join(s, 'a', 'Ann');
    join(s, 'b', 'Bob');
    s.handleMessage('a', { t: 'intent', seq: 701, intent: { k: 'ready', ready: true } });
    expect(s.sim).toBeNull();
    s.handleMessage('b', { t: 'intent', seq: 702, intent: { k: 'ready', ready: true } });
    expect(s.sim).not.toBeNull();
    expect(s.start!.slots.map((x) => x.name)).toEqual(['Ann', 'Bob']);
    const sim = s.sim!;
    // Through the countdown into the build phase.
    while (sim.world.phase === 'countdown') {
      sim.step();
      s.afterStep();
    }
    expect(sim.world.phase).toBe('build');
    s.handleMessage('a', { t: 'intent', seq: 703, intent: { k: 'buy', item: 'crate' } });
    s.handleMessage('a', { t: 'intent', seq: 704, intent: { k: 'buy', item: 'repair' } });
    expect(ackOf(sent, 703)).toBeUndefined();
    sim.step();
    s.afterStep();
    expect(ackOf(sent, 703)).toMatchObject({ ok: true });
    expect(ackOf(sent, 704)).toMatchObject({ ok: false, reason: 'invalid' });
    expect(sim.world.players[0]!.crates).toBe(1);
  });

  it('a dropped phone dazes its knight; its hello restores the slot by player key', () => {
    const { s } = setup();
    join(s, 'a', 'Ann');
    join(s, 'b', 'Bob');
    s.handleMessage('a', { t: 'intent', seq: 801, intent: { k: 'color', color: 'sky' } });
    s.handleMessage('a', { t: 'intent', seq: 802, intent: { k: 'ready', ready: true } });
    s.handleMessage('b', { t: 'intent', seq: 803, intent: { k: 'ready', ready: true } });
    const sim = s.sim!;
    s.handlePeer({ event: 'left', playerId: 'a', playerKey: 'key-a' });
    sim.step();
    expect(sim.world.players[0]!.connected).toBe(false);
    expect(s.connectedInRun()).toBe(1);
    // Back after the token window: a new relay id with the same key.
    s.handlePeer({ event: 'joined', playerId: 'a2', playerKey: 'key-a' });
    s.handleMessage('a2', { t: 'hello', proto: PROTOCOL_VERSION, deviceId: 'dev-a' });
    sim.step();
    const p = sim.world.players[0]!;
    expect(p.connected).toBe(true);
    expect(p.color).toBe('sky');
    expect(s.party.member('a2')!.slot).toBe(0);
  });

  it('a phone rejoining mid-build gets a full build-screen `me` at once (reconnect e2e, FF9)', () => {
    const { s, sent } = setup();
    join(s, 'a', 'Ann');
    join(s, 'b', 'Bob');
    s.handleMessage('a', { t: 'intent', seq: 811, intent: { k: 'ready', ready: true } });
    s.handleMessage('b', { t: 'intent', seq: 812, intent: { k: 'ready', ready: true } });
    const sim = s.sim!;
    while (sim.world.phase !== 'build') {
      sim.step();
      s.afterStep();
    }
    s.handlePeer({ event: 'left', playerId: 'a', playerKey: 'key-a' });
    sim.step();
    s.afterStep();
    s.handlePeer({ event: 'joined', playerId: 'a2', playerKey: 'key-a' });
    s.handleMessage('a2', { t: 'hello', proto: PROTOCOL_VERSION, deviceId: 'dev-a' });
    // The hello's own snapshot, before any step: the build screen with the Engineer's kit.
    const me = lastMe(sent, 'a2');
    expect(me.screen).toBe('build');
    expect(me.classId).toBe('engineer');
    expect(me.slot).toBe(0);
    expect(me.buildKit).toEqual(['arrow_tower']);
    expect(me.arc!.slots).toEqual(['arrow_tower', null, null, 'give']);
    expect(me.action).toBe('none');
    expect(isMeView(me)).toBe(true);
    sim.step();
    s.afterStep();
    expect(lastMe(sent, 'a2').screen).toBe('build');
  });

  it('only the content classes can be picked in the slice', () => {
    const { s, sent } = setup();
    join(s, 'a', 'Ann');
    s.handleMessage('a', { t: 'intent', seq: 901, intent: { k: 'class', classId: 'warden' } });
    expect(ackOf(sent, 901)).toMatchObject({ ok: false, reason: 'invalid' });
  });
});
