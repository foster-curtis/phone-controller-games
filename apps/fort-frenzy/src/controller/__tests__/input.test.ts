import { aimedGesture, type GestureInput, type GestureMachine } from '@pcg/controller-kit';
import { describe, expect, it } from 'vitest';
import {
  INPUT_FLAG_MAIN_AIMING,
  INPUT_FLAG_BUILD_AIMING,
  INPUT_FLAG_SUPER_AIMING,
  INPUT_TUPLE_LENGTH,
  isInputTuple,
} from '../../shared/messages';
import {
  TUPLE_LAYOUT,
  createPhoneSender,
  encodeAimed,
  encodeAimedState,
  encodeBuildTap,
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
  it('has the 12-field v2 tuple of SPEC §15.6 and a valid initial value', () => {
    const { sender } = setup();
    expect(TUPLE_LAYOUT).toHaveLength(INPUT_TUPLE_LENGTH);
    expect(TUPLE_LAYOUT.indexOf('flags')).toBe(8);
    expect(TUPLE_LAYOUT.indexOf('buildFires')).toBe(11);
    expect(sender.tuple()).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(isInputTuple(sender.tuple())).toBe(true);
  });

  it('streams in fixedRate mode: 5 Hz idle, 30 Hz while touched, at once on release', async () => {
    const { sender, sent } = setup();
    sender.touch('stick', true);
    const afterTouch = sent.length;
    expect(afterTouch).toBe(1); // the rate change sends at once
    await new Promise((r) => setTimeout(r, 140));
    expect(sent.length - afterTouch).toBeGreaterThanOrEqual(2); // ~30 Hz (loose: CI timers jitter)
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
    expect(sent[0]![10]).toBe(1);
  });

  it('aimed cancel changes nothing', () => {
    const { sender, sent } = setup();
    encodeAimed(sender, 'main', { kind: 'cancel' });
    expect(sent).toHaveLength(0);
    expect(sender.tuple().slice(9, 12)).toEqual([0, 0, 0]);
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

  it('the live aim rides along while aiming, so the TV line follows the thumb (FF7)', () => {
    const { sender, at } = setup();
    drive(
      aimedGesture(),
      [
        { type: 'down', t: 0 },
        { type: 'move', t: 30, dx: 35, dy: 0 },
        { type: 'move', t: 60, dx: 0, dy: 70 },
      ],
      (st) => encodeAimedState(sender, 'main', st),
      () => {},
    );
    expect([at('mainX'), at('mainY'), at('mainFires')]).toEqual([0, 100, 0]);
  });

  it('tap-type attack fires on release with aim 0,0, once per release', () => {
    const { sender, at } = setup();
    encodeTapAttack(sender, 'main');
    encodeTapAttack(sender, 'main');
    expect([at('mainFires'), at('mainX'), at('mainY')]).toEqual([2, 0, 0]);
  });

  it('build tap: a build fire at index 11 with aim 0,0, flags untouched', () => {
    const { sender, sent, at } = setup();
    sender.update({ buildX: 50, buildY: 50 });
    sent.length = 0;
    encodeBuildTap(sender);
    expect([at('buildFires'), at('buildX'), at('buildY'), at('flags')]).toEqual([1, 0, 0, 0]);
    expect(sent).toHaveLength(1);
    expect(sent[0]![11]).toBe(1);
    expect(sent[0]![8] & INPUT_FLAG_BUILD_AIMING).toBe(0);
  });

  it('flags sit at index 8: main aiming sets bit 1 there', () => {
    const { sender, sent } = setup();
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
    expect(sent.at(-1)![8]).toBe(INPUT_FLAG_MAIN_AIMING);
  });

  it('every tuple the sender produces passes the host guard', () => {
    const { sender, sent } = setup();
    encodeAimed(sender, 'main', { kind: 'fire', x: -70, y: 70 });
    encodeTapAttack(sender, 'super');
    sender.update({ moveX: -100, moveY: 100 });
    encodeBuildTap(sender);
    for (const t of sent) expect(isInputTuple(t)).toBe(true);
  });
});
