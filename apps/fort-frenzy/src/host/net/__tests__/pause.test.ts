// Team pause (C4, FF14-fix-1; SPEC §11.3, §15.6): any run phone pauses or resumes the whole run; the
// runtime steps nothing meanwhile (wall time, `advance`), timers hold, sim-bound intents ack `phase`,
// presses made while paused never fire on resume, every phone's `team` carries who paused, and the
// pause composes with the all-disconnected pause.
import { describe, expect, it } from 'vitest';
import type { HostClient } from '@pcg/net-client';
import {
  isIntent,
  isTeamView,
  PROTOCOL_VERSION,
  type AckReason,
  type HostMsg,
  type InputTuple,
  type Intent,
  type TeamView,
} from '../../../shared/messages';
import { createRuntime, type Runtime } from '../../game';
import { PhoneInputSource } from '../input';
import { memorySnapshotStore } from '../resume';

interface Sent {
  msg: HostMsg;
  to: string | undefined;
}

/** A relay host client that only records what the runtime sends and lets the test drive phones. */
function fakeClient() {
  const sent: Sent[] = [];
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
    kick: () => {},
    close: () => {},
    onMessage: (cb: (from: string, data: unknown) => void) => {
      subs.msg.push(cb);
      return () => {};
    },
    onPeer: (cb: (typeof subs.peer)[number]) => {
      subs.peer.push(cb);
      return () => {};
    },
    onRoom: () => () => {},
    onStatus: () => () => {},
    onError: () => () => {},
  } as unknown as HostClient;
  return {
    client,
    sent,
    message: (from: string, data: unknown) => subs.msg.forEach((cb) => cb(from, data)),
    peer: (event: 'joined' | 'left' | 'rejoined', playerId: string) =>
      subs.peer.forEach((cb) => cb({ event, playerId, playerKey: `key-${playerId}` })),
  };
}

function setup() {
  const clock = { t: 0 };
  const fake = fakeClient();
  const rt = createRuntime({
    client: fake.client,
    origin: 'http://tv.test',
    seed: 7,
    store: memorySnapshotStore(),
    now: () => clock.t,
  });
  let seq = 0;
  const intent = (id: string, i: Intent): number => {
    fake.message(id, { t: 'intent', seq: ++seq, intent: i });
    return seq;
  };
  const ackOf = (n: number) =>
    fake.sent.find((x) => x.msg.t === 'ack' && x.msg.seq === n)?.msg as
      { ok: boolean; reason?: AckReason } | undefined;
  const hello = (id: string) =>
    fake.message(id, { t: 'hello', proto: PROTOCOL_VERSION, deviceId: `dev-${id}` });
  const join = (id: string, name: string) => {
    fake.peer('joined', id);
    hello(id);
    intent(id, { k: 'name', name });
    intent(id, { k: 'class', classId: 'engineer' });
  };
  /** Wall time: `ms` in 50 ms ticks (the clock moves with it, so phone input stays fresh). */
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
  const lastTeam = (to?: string): TeamView =>
    (fake.sent.filter((x) => x.msg.t === 'team' && x.to === to).at(-1)!.msg as { team: TeamView })
      .team;
  return { rt, fake, clock, intent, ackOf, hello, join, run, until, lastTeam };
}

/** Two phones, both ready: the run reaches the build phase of wave 1. */
function toBuild() {
  const env = setup();
  env.join('a', 'Ann');
  env.join('b', 'Bob');
  env.intent('a', { k: 'ready', ready: true });
  env.intent('b', { k: 'ready', ready: true });
  expect(env.rt.session.sim).not.toBeNull();
  env.until('build');
  return env;
}

/** Then both ready again: the wave's combat phase. */
function toCombat() {
  const env = toBuild();
  env.intent('a', { k: 'ready', ready: true });
  env.intent('b', { k: 'ready', ready: true });
  env.until('combat');
  return env;
}

const tuple = (over: Partial<Record<number, number>> = {}): InputTuple => {
  const t: InputTuple = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1];
  for (const [i, v] of Object.entries(over)) t[Number(i)] = v!;
  return t;
};

const slotOf = (rt: Runtime, id: string) => rt.session.party.member(id)!.slot!;
const playerOf = (rt: Runtime, id: string) =>
  rt.world!.players.find((p) => p.slot === slotOf(rt, id))!;

describe('team pause: messages (FF14-fix-1)', () => {
  it('the pause intent and the team view`s `paused` pass the guards', () => {
    expect(isIntent({ k: 'pause', paused: true })).toBe(true);
    expect(isIntent({ k: 'pause', paused: false })).toBe(true);
    expect(isIntent({ k: 'pause' })).toBe(false);
    expect(isIntent({ k: 'pause', paused: 1 })).toBe(false);
    const env = toBuild();
    expect(isTeamView(env.lastTeam())).toBe(true);
    env.intent('a', { k: 'pause', paused: true });
    env.run(300);
    const team = env.lastTeam();
    expect(isTeamView(team)).toBe(true);
    expect(isTeamView({ ...team, paused: null })).toBe(true);
    expect(isTeamView({ ...team, paused: { playerId: 'a', name: 'Ann', color: 'red' } })).toBe(
      false,
    );
  });
});

describe('team pause: freezing the run (FF14-fix-1)', () => {
  it('a pause from any slot freezes the step count, the sim tick and the build timer', () => {
    const env = toBuild();
    const { rt } = env;
    env.run(500);
    const steps = rt.stats.steps;
    const tick = rt.world!.tick;
    const buildEnds = rt.world!.phaseEndsAt;
    const n = env.intent('b', { k: 'pause', paused: true });
    expect(env.ackOf(n)).toEqual({ t: 'ack', seq: n, ok: true });
    expect(rt.paused).toEqual({ playerId: 'b', name: 'Bob', color: 'jade' });

    env.run(3000);
    rt.advance(120); // the debug / e2e stepper holds too
    expect(rt.stats.steps).toBe(steps);
    expect(rt.world!.tick).toBe(tick);
    expect(rt.world!.phaseEndsAt).toBe(buildEnds);
    // The phones' build countdown holds too.
    const msLeft = env.lastTeam().buildEndsInMs;
    expect(msLeft).toBeGreaterThan(0);
    env.run(1000);
    expect(env.lastTeam().buildEndsInMs).toBe(msLeft);
  });

  it('a resume from another slot continues: steps and the timer advance again', () => {
    const env = toBuild();
    const { rt } = env;
    env.intent('a', { k: 'pause', paused: true });
    env.run(1000);
    const steps = rt.stats.steps;
    const tick = rt.world!.tick;
    const n = env.intent('b', { k: 'pause', paused: false });
    expect(env.ackOf(n)?.ok).toBe(true);
    expect(rt.paused).toBeNull();
    env.run(1000);
    expect(rt.stats.steps).toBeGreaterThanOrEqual(steps + 55);
    expect(rt.world!.tick).toBeGreaterThan(tick);
  });

  it('pausing twice keeps the first pauser; resuming a running game is a no-op', () => {
    const env = toBuild();
    expect(env.ackOf(env.intent('b', { k: 'pause', paused: false }))?.ok).toBe(true);
    env.intent('a', { k: 'pause', paused: true });
    expect(env.ackOf(env.intent('b', { k: 'pause', paused: true }))?.ok).toBe(true);
    expect(env.rt.paused?.name).toBe('Ann');
  });

  it('refuses a pause outside a run and from a phone with no run slot', () => {
    const env = setup();
    env.join('a', 'Ann');
    expect(env.ackOf(env.intent('a', { k: 'pause', paused: true }))?.reason).toBe('phase');
    env.join('b', 'Bob');
    env.intent('a', { k: 'ready', ready: true });
    env.intent('b', { k: 'ready', ready: true });
    env.until('combat');
    // A late joiner waits for the build phase with no slot.
    env.join('c', 'Cat');
    expect(env.ackOf(env.intent('c', { k: 'pause', paused: true }))?.reason).toBe('phase');
    expect(env.rt.paused).toBeNull();
  });
});

describe('team pause: input while paused (FF14-fix-1)', () => {
  it('moving while paused does nothing', () => {
    const env = toBuild();
    const { rt } = env;
    env.intent('a', { k: 'pause', paused: true });
    const before = { x: playerOf(rt, 'a').x, y: playerOf(rt, 'a').y };
    for (let i = 0; i < 20; i++) {
      env.fake.message('a', tuple({ 0: 100 }));
      env.run(50);
    }
    expect({ x: playerOf(rt, 'a').x, y: playerOf(rt, 'a').y }).toEqual(before);
  });

  it('presses made while paused never fire on resume; a press after it does', () => {
    const env = toCombat();
    const { rt } = env;
    env.fake.message('a', tuple());
    env.run(500);
    env.intent('b', { k: 'pause', paused: true });
    // A tap released while paused: the counter goes up on the phone.
    env.fake.message('a', tuple({ 7: 1 }));
    env.run(200);
    env.intent('a', { k: 'pause', paused: false });
    const shots = rt.stats.shots;
    for (let i = 0; i < 20; i++) {
      env.fake.message('a', tuple({ 7: 1 }));
      env.run(50);
    }
    expect(rt.stats.shots).toBe(shots);
    // The next real press fires.
    for (let i = 0; i < 40; i++) {
      env.fake.message('a', tuple({ 7: 2 }));
      env.run(50);
    }
    expect(rt.stats.shots).toBeGreaterThan(shots);
  });

  it('sim-bound intents while paused ack `phase` and queue nothing', () => {
    const env = toBuild();
    env.intent('a', { k: 'pause', paused: true });
    const n1 = env.intent('a', { k: 'build', action: 'select', structure: 'arrow_tower' });
    const n2 = env.intent('b', { k: 'give' });
    const n3 = env.intent('b', { k: 'ready', ready: true });
    for (const n of [n1, n2, n3]) expect(env.ackOf(n)?.reason).toBe('phase');
    env.intent('a', { k: 'pause', paused: false });
    env.run(200);
    expect(playerOf(env.rt, 'b').ready).toBe(false);
    expect(playerOf(env.rt, 'a').ghost).toBeNull();
  });

  it('PhoneInputSource swallows the counters between hold and release', () => {
    let t = 0;
    const src = new PhoneInputSource(() => t);
    src.push(tuple({ 7: 3, 9: 1 }));
    src.hold();
    src.push(tuple({ 7: 5, 9: 2 }));
    src.release();
    let s = src.sample(0);
    expect([s.mainFires, s.actionTaps]).toEqual([3, 1]);
    src.push(tuple({ 7: 6, 9: 2 }));
    s = src.sample(0);
    expect([s.mainFires, s.actionTaps]).toEqual([4, 1]);
    // Stale samples keep the shifted counters too.
    t += 1000;
    expect(src.sample(0).mainFires).toBe(4);
  });
});

describe('team pause: what the phones and the TV see (FF14-fix-1)', () => {
  it('every phone`s team state carries who paused, and a hello while paused gets it too', async () => {
    const env = toBuild();
    await env.rt.createRoom(); // the TV shows its run screens only with a room
    env.intent('a', { k: 'pause', paused: true });
    env.run(300);
    // `team` is a broadcast: one message every phone receives.
    expect(env.lastTeam().paused).toEqual({ playerId: 'a', name: 'Ann', color: 'cobalt' });
    env.hello('b');
    expect(env.lastTeam('b').paused?.name).toBe('Ann');
    expect(env.rt.tvView().paused).toEqual({ playerId: 'a', name: 'Ann', color: 'cobalt' });
    env.intent('b', { k: 'pause', paused: false });
    env.run(300);
    expect(env.lastTeam().paused).toBeUndefined();
    expect(env.rt.tvView().paused).toBeNull();
  });
});

describe('team pause: composing with the all-disconnected pause (FF14-fix-1)', () => {
  it('neither clears the other; the run moves only when both are off', () => {
    const env = toBuild();
    const { rt } = env;
    env.intent('a', { k: 'pause', paused: true });
    env.fake.peer('left', 'a');
    env.fake.peer('left', 'b');
    env.run(300);
    expect(rt.pausedAll).toBe(true);
    expect(rt.paused?.name).toBe('Ann');
    const steps = rt.stats.steps;

    // Back: no longer all disconnected, but still paused by the team.
    env.fake.peer('rejoined', 'b');
    env.hello('b');
    env.run(500);
    expect(rt.pausedAll).toBe(false);
    expect(rt.paused?.name).toBe('Ann');
    expect(rt.stats.steps).toBe(steps);

    // All gone again, then a resume from the phone that came back first.
    env.fake.peer('left', 'b');
    env.fake.peer('rejoined', 'a');
    env.hello('a');
    env.intent('a', { k: 'pause', paused: false });
    env.run(500);
    expect(rt.paused).toBeNull();
    expect(rt.stats.steps).toBeGreaterThan(steps);
  });

  it('the resume snapshot taken while paused restores unpaused', () => {
    const env = toBuild();
    env.intent('a', { k: 'pause', paused: true });
    env.run(300);
    const snap = env.rt.session.snapshot();
    expect(snap).not.toBeNull();
    expect(JSON.stringify(snap)).not.toContain('paused');
  });
});
