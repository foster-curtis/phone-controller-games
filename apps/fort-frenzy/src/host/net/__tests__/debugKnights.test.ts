// The debug panel's knight list (SPEC §9.5, RD6-fix-2) against a real session: lobby knights and
// knight changes, the run's slots, a late joiner, a player who left (knight kept, marked), a debug give,
// and the lobby again after End game.
import { describe, expect, it } from 'vitest';
import { PROTOCOL_VERSION, type Intent } from '../../../shared/messages';
import { knightsInPlay } from '../../debugInfo';
import { memorySnapshotStore } from '../resume';
import { createSession, type Session } from '../session';

function setup() {
  const clock = { t: 0 };
  const s = createSession({
    send: () => {},
    kick: () => {},
    now: () => clock.t,
    wallClock: () => 5_000_000,
    seed: () => 7,
    store: memorySnapshotStore(),
  });
  let seq = 0;
  const intent = (id: string, i: Intent) =>
    s.handleMessage(id, { t: 'intent', seq: ++seq, intent: i });
  const join = (id: string, name: string, classId: 'ranger' | 'warden' | 'artificer') => {
    s.handlePeer({ event: 'joined', playerId: id, playerKey: `key-${id}` });
    s.handleMessage(id, { t: 'hello', proto: PROTOCOL_VERSION, deviceId: `dev-${id}` });
    intent(id, { k: 'name', name });
    intent(id, { k: 'class', classId });
  };
  const step = (n = 1) => {
    for (let i = 0; i < n && s.sim; i++) {
      s.sim.step();
      s.afterStep();
    }
    clock.t += 300;
    s.flush();
  };
  return { s, intent, join, step };
}

const rows = (s: Session) =>
  knightsInPlay(s.party.members, s.sim?.world ?? null).map((r) => ({
    slot: r.slot,
    name: r.name,
    classId: r.classId,
    inRun: r.inRun,
    left: r.left,
    cards: r.cards,
  }));

describe('debug panel: knights in play', () => {
  it('follows joins, knight changes, the run, a late join, a leave and the lobby again', () => {
    const { s, intent, join, step } = setup();
    join('a', 'Ann', 'ranger');
    expect(rows(s)).toEqual([
      { slot: null, name: 'Ann', classId: 'ranger', inRun: false, left: false, cards: {} },
    ]);
    join('b', 'Bob', 'ranger');
    intent('b', { k: 'class', classId: 'warden' });
    expect(rows(s).map((r) => r.classId)).toEqual(['ranger', 'warden']);

    intent('a', { k: 'ready', ready: true });
    intent('b', { k: 'ready', ready: true });
    while (s.sim!.world.phase !== 'build') step();
    expect(rows(s).map((r) => [r.slot, r.name, r.classId, r.inRun])).toEqual([
      [0, 'Ann', 'ranger', true],
      [1, 'Bob', 'warden', true],
    ]);

    // A give shows in the list with its count.
    s.command({ c: 'debug', slot: -1, action: 'card', target: 1, card: 'vitality' });
    s.command({ c: 'debug', slot: -1, action: 'card', target: 1, card: 'vitality' });
    step();
    expect(rows(s)[1]!.cards).toEqual({ vitality: 2 });

    // A late joiner in the build phase.
    join('c', 'Cy', 'artificer');
    intent('c', { k: 'ready', ready: true });
    step();
    expect(rows(s).map((r) => [r.slot, r.classId])).toEqual([
      [0, 'ranger'],
      [1, 'warden'],
      [2, 'artificer'],
    ]);

    // Bob leaves: his knight stays in the run, marked.
    intent('b', { k: 'leave' });
    step();
    expect(rows(s).map((r) => [r.slot, r.left])).toEqual([
      [0, false],
      [1, true],
      [2, false],
    ]);

    // End game: back to the lobby, where knights change.
    intent('a', { k: 'leader', action: 'endGame' });
    step();
    expect(s.sim).toBeNull();
    intent('a', { k: 'class', classId: 'warden' });
    expect(rows(s).map((r) => [r.slot, r.name, r.classId, r.inRun])).toEqual([
      [null, 'Ann', 'warden', false],
      [null, 'Cy', 'artificer', false],
    ]);
  });
});
