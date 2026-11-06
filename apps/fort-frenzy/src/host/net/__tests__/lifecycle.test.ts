// Run lifecycle on the host (SPEC §4, §11.2, §11.5, §15.8; BUILD_PLAN FF14): late joins only at a
// build phase, the end-of-run options, and the resume snapshot (saved at build, cleared at the end,
// offered after a reload, restored into the same room by key or a new room by device ID or claim).
import { describe, expect, it } from 'vitest';
import {
  PROTOCOL_VERSION,
  type AckReason,
  type HostMsg,
  type Intent,
  type MeView,
} from '../../../shared/messages';
import { memorySnapshotStore, type SnapshotStore } from '../resume';
import { createSession, type Session } from '../session';

interface Sent {
  msg: HostMsg;
  to: string | undefined;
}

function setup(store: SnapshotStore = memorySnapshotStore()) {
  const clock = { t: 0, wall: 5_000_000 };
  const sent: Sent[] = [];
  let homes = 0;
  const s = createSession({
    send: (msg, to) => sent.push({ msg, to }),
    kick: () => {},
    now: () => clock.t,
    wallClock: () => clock.wall,
    seed: () => 7,
    store,
    onHome: () => homes++,
  });
  return { s, sent, clock, store, homes: () => homes };
}

let seq = 0;
function intent(s: Session, id: string, i: Intent): number {
  s.handleMessage(id, { t: 'intent', seq: ++seq, intent: i });
  return seq;
}

function hello(s: Session, id: string, key: string, deviceId: string) {
  s.handlePeer({ event: 'joined', playerId: id, playerKey: key });
  s.handleMessage(id, { t: 'hello', proto: PROTOCOL_VERSION, deviceId });
}

function join(s: Session, id: string, name: string) {
  hello(s, id, `key-${id}`, `dev-${id}`);
  intent(s, id, { k: 'name', name });
  intent(s, id, { k: 'class', classId: 'engineer' });
}

const lastMe = (sent: Sent[], to: string): MeView =>
  (sent.filter((x) => x.msg.t === 'me' && x.to === to).at(-1)!.msg as { me: MeView }).me;

const ackOf = (sent: Sent[], n: number) =>
  sent.find((x) => x.msg.t === 'ack' && x.msg.seq === n)?.msg as
    { ok: boolean; reason?: AckReason } | undefined;

/** Steps the run `n` times (afterStep each), then syncs the phones with the clock moved on. */
function step(env: ReturnType<typeof setup>, n = 1) {
  for (let i = 0; i < n && env.s.sim; i++) {
    env.s.sim.step();
    env.s.afterStep();
  }
  env.clock.t += 300;
  env.s.flush();
}

/** Two phones, both ready: the run starts and reaches the build phase of wave 1. */
function toBuild(env = setup()) {
  join(env.s, 'a', 'Ann');
  join(env.s, 'b', 'Bob');
  intent(env.s, 'a', { k: 'ready', ready: true });
  intent(env.s, 'b', { k: 'ready', ready: true });
  expect(env.s.sim).not.toBeNull();
  while (env.s.sim!.world.phase !== 'build') step(env);
  return env;
}

function toCombat(env: ReturnType<typeof setup>) {
  intent(env.s, 'a', { k: 'ready', ready: true });
  intent(env.s, 'b', { k: 'ready', ready: true });
  step(env, 2);
  expect(env.s.sim!.world.phase).toBe('combat');
}

function toSummary(env: ReturnType<typeof setup>) {
  env.s.sim!.world.base.hp = 0;
  step(env, 2);
  expect(env.s.sim!.world.phase).toBe('defeat');
  while (env.s.sim!.world.phase !== 'summary') step(env, 60);
}

describe('late joins (§11.2)', () => {
  it('a phone joining in combat waits, then joins at the next build phase at the base', () => {
    const env = toBuild();
    toCombat(env);
    join(env.s, 'c', 'Cy');
    step(env);
    expect(lastMe(env.sent, 'c').screen).toBe('waiting');
    // Ready in combat is refused: late joins open only in the build phase.
    const early = intent(env.s, 'c', { k: 'ready', ready: true });
    expect(ackOf(env.sent, early)).toEqual({ t: 'ack', seq: early, ok: false, reason: 'phase' });
    expect(env.s.sim!.world.players.length).toBe(2);

    env.s.command({ c: 'debug', slot: -1, action: 'jumpWave', wave: 2 });
    step(env);
    expect(env.s.sim!.world.phase).toBe('build');
    expect(lastMe(env.sent, 'c').screen).toBe('lobby');
    const r = intent(env.s, 'c', { k: 'ready', ready: true });
    step(env);
    expect(ackOf(env.sent, r)?.ok).toBe(true);
    const w = env.s.sim!.world;
    const p = w.players.find((x) => x.name === 'Cy')!;
    expect(p.slot).toBe(2);
    expect(p.offer?.length).toBeGreaterThan(0);
    // At the base: the respawn point of the slot.
    const spawn = env.s.content.rules!.respawn;
    const at = spawn[p.slot % spawn.length]!;
    expect([p.x, p.y]).toEqual([at.x, at.y]);
    expect(lastMe(env.sent, 'c').screen).toBe('build');
    expect(env.s.party.member('c')?.slot).toBe(2);
  });
});

describe('end of the run (§4)', () => {
  it('play again keeps every class and goes straight to Ready: the next run starts', () => {
    const env = toBuild();
    toSummary(env);
    const first = env.s.sim;
    const n = intent(env.s, 'a', { k: 'leader', action: 'end', option: 'again' });
    expect(ackOf(env.sent, n)?.ok).toBe(true);
    expect(env.s.sim).not.toBe(first);
    expect(env.s.sim?.world.phase).toBe('countdown');
    expect(env.s.sim?.world.players.map((p) => p.classId)).toEqual(['engineer', 'engineer']);
  });

  it('change classes goes back to class select, nobody ready', () => {
    const env = toBuild();
    toSummary(env);
    intent(env.s, 'a', { k: 'leader', action: 'end', option: 'classes' });
    expect(env.s.sim).toBeNull();
    step(env);
    expect(lastMe(env.sent, 'a').screen).toBe('lobby');
    expect(env.s.party.members.map((m) => [m.ready, m.classId])).toEqual([
      [false, 'engineer'],
      [false, 'engineer'],
    ]);
  });

  it('home ends the run and hands the room back to the runtime', () => {
    const env = toBuild();
    toSummary(env);
    const notLeader = intent(env.s, 'b', { k: 'leader', action: 'end', option: 'home' });
    expect(ackOf(env.sent, notLeader)?.reason).toBe('notLeader');
    intent(env.s, 'a', { k: 'leader', action: 'end', option: 'home' });
    expect(env.homes()).toBe(1);
    expect(env.s.sim).toBeNull();
  });

  it('the summary has an award card per player and the run time', () => {
    const env = toBuild();
    env.s.sim!.world.players[0]!.run.kills = 4;
    toSummary(env);
    const sum = env.s.summary!;
    expect(sum.result).toBe('defeat');
    expect(sum.players.map((p) => p.name)).toEqual(['Ann', 'Bob']);
    expect(sum.players[0]!.award).toBe('kills');
    expect(sum.durationMs).toBeGreaterThan(0);
  });
});

describe('resume snapshot on the host (§11.5, §15.8)', () => {
  it('saves at the build start and on changes, and clears at the end of the run', () => {
    const env = toBuild();
    expect(env.store.load(env.clock.wall)?.wave).toBe(1);
    const sim = env.s.sim!;
    sim.place('arrow_tower', 10, 10, 0);
    step(env);
    expect(env.store.load(env.clock.wall)?.structures.length).toBe(1);
    toCombat(env);
    // Combat keeps the build-phase snapshot: a reload resumes the build of this wave.
    expect(env.store.load(env.clock.wall)?.wave).toBe(1);
    toSummary(env);
    expect(env.store.load(env.clock.wall)).toBeNull();
  });

  it('a reloaded TV in the same room: phones match by key, the leader resumes the same build', () => {
    const before = toBuild();
    before.s.sim!.place('wall', 12, 11, 1);
    before.s.sim!.world.team.coins = 77;
    step(before);
    const offers = before.s.sim!.world.players.map((p) => p.offer);

    const env = setup(before.store);
    expect(env.s.restoring?.wave).toBe(1);
    env.s.handleRoom({
      reclaimed: true,
      roster: [
        { playerId: 'a', playerKey: 'key-a', connected: true },
        { playerId: 'b', playerKey: 'key-b', connected: true },
      ],
    });
    env.s.handleMessage('a', { t: 'hello', proto: PROTOCOL_VERSION, deviceId: 'dev-a' });
    env.s.handleMessage('b', { t: 'hello', proto: PROTOCOL_VERSION, deviceId: 'dev-b' });
    expect(lastMe(env.sent, 'a')).toMatchObject({ screen: 'restoring', isLeader: true, slot: 0 });
    expect(lastMe(env.sent, 'b').screen).toBe('restoring');
    // Only the leader chooses.
    const no = intent(env.s, 'b', { k: 'leader', action: 'resume' });
    expect(ackOf(env.sent, no)?.reason).toBe('notLeader');
    const yes = intent(env.s, 'a', { k: 'leader', action: 'resume' });
    expect(ackOf(env.sent, yes)?.ok).toBe(true);
    const w = env.s.sim!.world;
    expect([w.phase, w.wave, w.team.coins]).toEqual(['build', 1, 77]);
    expect(w.structures.map((x) => [x.kind, x.tile])).toEqual([['wall', [12, 11]]]);
    expect(w.players.map((p) => p.offer)).toEqual(offers);
    expect(w.players.every((p) => p.connected)).toBe(true);
    step(env);
    expect(lastMe(env.sent, 'a').screen).toBe('build');
  });

  it('a new room: phones match by device ID, an unknown phone claims a free slot', () => {
    const before = toBuild();
    step(before);
    const env = setup(before.store);
    env.s.handleRoom({ reclaimed: false, roster: [] });
    // Ann's phone is back under a new id and key (another room code), same device.
    hello(env.s, 'x', 'key-x', 'dev-a');
    // Bob's phone lost its storage: an unknown device.
    hello(env.s, 'y', 'key-y', 'dev-new');
    expect(lastMe(env.sent, 'x')).toMatchObject({ screen: 'restoring', slot: 0, name: 'Ann' });
    const claim = lastMe(env.sent, 'y');
    expect(claim.screen).toBe('claim');
    expect(claim.claim).toEqual([{ slot: 1, name: 'Bob', classId: 'engineer' }]);
    const taken = intent(env.s, 'y', { k: 'claim', slot: 0 });
    expect(ackOf(env.sent, taken)?.ok).toBe(false);
    const c = intent(env.s, 'y', { k: 'claim', slot: 1 });
    expect(ackOf(env.sent, c)?.ok).toBe(true);
    expect(env.s.party.members.map((m) => [m.playerId, m.slot, m.connected])).toEqual([
      ['x', 0, true],
      ['y', 1, true],
    ]);
    // The TV chooses Resume.
    expect(env.s.resume()).toBeNull();
    step(env);
    expect(env.s.sim!.world.players.every((p) => p.connected)).toBe(true);
    expect(lastMe(env.sent, 'y').screen).toBe('build');
    // The next save carries the new identities.
    expect(env.store.load(env.clock.wall)?.slots.map((s) => [s.playerKey, s.deviceId])).toEqual([
      ['key-x', 'dev-a'],
      ['key-y', 'dev-new'],
    ]);
  });

  it('new run drops the saved run: the lobby with the phones that are here', () => {
    const before = toBuild();
    const env = setup(before.store);
    env.s.handleRoom({ reclaimed: true, roster: [] });
    hello(env.s, 'a', 'key-a', 'dev-a');
    const n = intent(env.s, 'a', { k: 'leader', action: 'newRun' });
    expect(ackOf(env.sent, n)?.ok).toBe(true);
    expect(env.s.restoring).toBeNull();
    expect(env.store.load(env.clock.wall)).toBeNull();
    expect(env.s.party.members.map((m) => [m.playerId, m.name, m.slot])).toEqual([
      ['a', 'Ann', null],
    ]);
    step(env);
    expect(lastMe(env.sent, 'a').screen).toBe('lobby');
  });

  it('a snapshot older than 12 hours is not offered', () => {
    const before = toBuild();
    const store = before.store;
    const env = setup(store);
    expect(env.s.restoring).not.toBeNull();
    const late = createSession({
      send: () => {},
      kick: () => {},
      store,
      wallClock: () => before.clock.wall + 12 * 3600_000 + 1,
    });
    expect(late.restoring).toBeNull();
  });
});
