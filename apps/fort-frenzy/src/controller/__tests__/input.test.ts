import {
  SLOT_DOWN,
  SLOT_LEFT,
  SLOT_NONE,
  SLOT_UP,
  aimedGesture,
  radialGesture,
  type GestureInput,
  type GestureMachine,
} from '@pcg/controller-kit';
import { describe, expect, it } from 'vitest';
import {
  INPUT_FLAG_MAIN_AIMING,
  INPUT_FLAG_RADIAL_OPEN,
  INPUT_FLAG_SUPER_AIMING,
  INPUT_TUPLE_LENGTH,
  isInputTuple,
} from '../../shared/messages';
import {
  TUPLE_LAYOUT,
  createPhoneSender,
  encodeAimed,
  encodeAimedState,
  encodeRadial,
  encodeRadialState,
  encodeTapAttack,
} from '../input';

function setup() {
  const sent: number[][] = [];
  const sender = createPhoneSender((t) => sent.push(t));
  sender.start();
  sent.length = 0;
  const at = (k: (typeof TUPLE_LAYOUT)[number]) => sender.get(k);
  return { sender, sent, at };
}

/** Runs a gesture machine over inputs, calling `onState` / `onOutput` like bindGesture. */
function drive<S, O>(
  m: GestureMachine<S, O>,
  inputs: GestureInput[],
  onState: (s: S) => void,
  onOutput: (o: O, s: S) => void,
) {
  let s = m.initial();
  for (const i of inputs) {
    const r = m.step(s, i);
    if (r.state !== s) onState(r.state);
    s = r.state;
    for (const o of r.out) onOutput(o, s);
  }
}

describe('phone sender', () => {
  it('has the 12-field tuple of SPEC §15.6 and a valid initial value', () => {
    const { sender } = setup();
    expect(TUPLE_LAYOUT).toHaveLength(INPUT_TUPLE_LENGTH);
    expect(sender.tuple()).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1]);
    expect(isInputTuple(sender.tuple())).toBe(true);
  });

  it('streams in fixedRate mode: 5 Hz idle, 30 Hz while touched, at once on release', async () => {
    const { sender, sent } = setup();
    sender.touch('stick', true);
    const afterTouch = sent.length;
    expect(afterTouch).toBe(1); // the rate change sends at once
    await new Promise((r) => setTimeout(r, 140));
    expect(sent.length - afterTouch).toBeGreaterThanOrEqual(3); // ~30 Hz
    sender.touch('stick', false);
    expect(sent.length).toBeGreaterThan(afterTouch + 3);
    sender.stop();
  });
});

describe('gesture outcomes in the tuple', () => {
  it('aimed tap: a fire with aim 0,0 (auto-aim)', () => {
    const { sender, at } = setup();
    sender.update({ mainX: 40, mainY: 40 });
    encodeAimed(sender, 'main', { kind: 'tap' });
    expect([at('mainX'), at('mainY'), at('mainFires')]).toEqual([0, 0, 1]);
  });

  it('aimed fire: the aim in the same send as the counter, scaled to -100..100', () => {
    const { sender, sent, at } = setup();
    encodeAimed(sender, 'super', { kind: 'fire', x: 70, y: -35 });
    expect([at('superX'), at('superY'), at('superFires')]).toEqual([100, -50, 1]);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.slice(4, 6)).toEqual([100, -50]);
    expect(sent[0]![8]).toBe(1);
  });

  it('aimed cancel changes nothing', () => {
    const { sender, sent } = setup();
    encodeAimed(sender, 'main', { kind: 'cancel' });
    expect(sent).toHaveLength(0);
    expect(sender.tuple().slice(7, 9)).toEqual([0, 0]);
  });

  it('aiming flag follows the press state (main 1, super 2)', () => {
    const { sender, at } = setup();
    const m = aimedGesture();
    drive(
      m,
      [
        { type: 'down', t: 0 },
        { type: 'move', t: 20, dx: 40, dy: 0 },
      ],
      (st) => encodeAimedState(sender, 'main', st),
      () => {},
    );
    expect(at('flags')).toBe(INPUT_FLAG_MAIN_AIMING);
    drive(
      m,
      [
        { type: 'down', t: 0 },
        { type: 'move', t: 20, dx: 0, dy: 40 },
      ],
      (st) => encodeAimedState(sender, 'super', st),
      () => {},
    );
    expect(at('flags')).toBe(INPUT_FLAG_MAIN_AIMING | INPUT_FLAG_SUPER_AIMING);
  });

  it('a full aimed drag-and-release sets the flag, then fires and clears it', () => {
    const { sender, at } = setup();
    drive(
      aimedGesture(),
      [
        { type: 'down', t: 0 },
        { type: 'move', t: 50, dx: 0, dy: -70 },
        { type: 'up', t: 300, dx: 0, dy: -70 },
      ],
      (st) => encodeAimedState(sender, 'main', st),
      (o) => encodeAimed(sender, 'main', o),
    );
    expect([at('mainX'), at('mainY'), at('mainFires'), at('flags')]).toEqual([0, -100, 1, 0]);
  });

  it('tap-type attack fires on release with aim 0,0, once per release', () => {
    const { sender, at } = setup();
    encodeTapAttack(sender, 'main');
    encodeTapAttack(sender, 'main');
    expect([at('mainFires'), at('mainX'), at('mainY')]).toEqual([2, 0, 0]);
  });

  const slots = [true, true, null, true];
  const radial = () =>
    radialGesture({
      slots,
      tapMs: 150,
      openMs: 400,
      deadZonePx: 8.4,
      hysteresisPx: 8,
      repeatMs: 300,
      repeatSlot: SLOT_DOWN,
    });

  it('radial tap = an action tap', () => {
    const { sender, at } = setup();
    drive(
      radial(),
      [
        { type: 'down', t: 0 },
        { type: 'up', t: 80, dx: 0, dy: 0 },
      ],
      (st) => encodeRadialState(sender, st, true),
      (o, st) => encodeRadial(sender, o, st),
    );
    expect([at('actionTaps'), at('radialCommits'), at('radialSlot'), at('flags')]).toEqual([
      1,
      0,
      SLOT_NONE,
      0,
    ]);
  });

  it('radial drag opens the arc (flag 4, slot follows), release commits the slot and clears', () => {
    const { sender, sent, at } = setup();
    const m = radial();
    let s = m.initial();
    const feed = (i: GestureInput) => {
      const r = m.step(s, i);
      if (r.state !== s) encodeRadialState(sender, r.state, true);
      s = r.state;
      for (const o of r.out) encodeRadial(sender, o, s);
    };
    feed({ type: 'down', t: 0 });
    feed({ type: 'move', t: 30, dx: 0, dy: -40 });
    expect(at('flags') & INPUT_FLAG_RADIAL_OPEN).toBe(INPUT_FLAG_RADIAL_OPEN);
    expect(at('radialSlot')).toBe(SLOT_UP);
    feed({ type: 'up', t: 60, dx: 0, dy: -40 });
    expect(at('radialCommits')).toBe(1);
    expect(at('radialSlot')).toBe(SLOT_NONE);
    expect(at('flags')).toBe(0);
    // The commit tuple carried the slot: find it among the sends.
    expect(sent.some((t) => t[10] === 1 && t[11] === SLOT_UP)).toBe(true);
  });

  it('radial release in the dead zone after opening cancels: no commit', () => {
    const { sender, at } = setup();
    drive(
      radial(),
      [
        { type: 'down', t: 0 },
        { type: 'move', t: 450, dx: 0, dy: 0 },
        { type: 'tick', t: 450 },
        { type: 'up', t: 500, dx: 0, dy: 0 },
      ],
      (st) => encodeRadialState(sender, st, true),
      (o, st) => encodeRadial(sender, o, st),
    );
    expect([at('radialCommits'), at('radialSlot'), at('flags')]).toEqual([0, SLOT_NONE, 0]);
  });

  it('holding on Give repeats commits every 300 ms, then ends without an extra commit', () => {
    const { sender, at } = setup();
    drive(
      radial(),
      [
        { type: 'down', t: 0 },
        { type: 'move', t: 20, dx: 0, dy: 40 },
        { type: 'tick', t: 650 },
        { type: 'up', t: 650, dx: 0, dy: 40 },
      ],
      (st) => encodeRadialState(sender, st, true),
      (o, st) => encodeRadial(sender, o, st),
    );
    // The arc opens at the first move (dragged out); Give's repeat timer runs from there (t=20):
    // repeats at 320 and 620; the release after repeats only ends.
    expect(at('radialCommits')).toBe(2);
    expect(at('radialSlot')).toBe(SLOT_NONE);
  });

  it('a single Give slot: holding 0.4 s commits Give directly, no arc flag', () => {
    const { sender, at } = setup();
    const single = radialGesture({
      slots: [null, null, null, true],
      tapMs: 150,
      openMs: 400,
      deadZonePx: 8.4,
      hysteresisPx: 8,
      repeatMs: 300,
      repeatSlot: SLOT_DOWN,
    });
    drive(
      single,
      [
        { type: 'down', t: 0 },
        { type: 'tick', t: 400 },
        { type: 'tick', t: 700 },
        { type: 'up', t: 710 },
      ],
      (st) => encodeRadialState(sender, st, true),
      (o, st) => encodeRadial(sender, o, st),
    );
    expect(at('radialCommits')).toBe(2);
    expect(at('flags')).toBe(0);
    expect(at('radialSlot')).toBe(SLOT_NONE);
  });

  it('no slots: the flag is never set even if the machine opens', () => {
    const { sender, at } = setup();
    drive(
      radialGesture({
        slots: [null, null, null, null],
        tapMs: 150,
        openMs: 400,
        deadZonePx: 8.4,
        hysteresisPx: 8,
        repeatMs: 300,
        repeatSlot: SLOT_DOWN,
      }),
      [
        { type: 'down', t: 0 },
        { type: 'move', t: 20, dx: -40, dy: 0 },
      ],
      (st) => encodeRadialState(sender, st, false),
      () => {},
    );
    expect([at('flags'), at('radialSlot')]).toEqual([0, SLOT_NONE]);
    void SLOT_LEFT;
  });

  it('every tuple the sender produces passes the host guard', () => {
    const { sender, sent } = setup();
    encodeAimed(sender, 'main', { kind: 'fire', x: -70, y: 70 });
    encodeTapAttack(sender, 'super');
    sender.update({ moveX: -100, moveY: 100 });
    sender.bump('actionTaps');
    for (const t of sent) expect(isInputTuple(t)).toBe(true);
  });
});
