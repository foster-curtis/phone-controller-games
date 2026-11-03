// Gesture tables of Fort Frenzy SPEC §15.7, run against the pure reducers (no DOM), plus the DOM
// adapter with fake timers.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AIMED_DEFAULTS,
  aimToStick,
  aimedGesture,
  aimedStep,
  isAiming,
  type AimedOutput,
  type AimedState,
} from '../src/gestures/aimed';
import { bindGesture } from '../src/gestures/bind';
import {
  RADIAL_DEFAULTS,
  SLOT_DOWN,
  SLOT_LEFT,
  SLOT_NONE,
  SLOT_RIGHT,
  SLOT_UP,
  isRadialOpen,
  pickSlot,
  radialGesture,
  radialStep,
  type RadialConfig,
  type RadialOutput,
  type RadialState,
} from '../src/gestures/radial';
import { tapStep } from '../src/gestures/tap';
import type { GestureInput } from '../src/gestures/types';
import { pointer } from './helpers';

/** Runs inputs through a reducer, collecting every output. */
function run<S, O>(
  step: (s: S, i: GestureInput) => { state: S; out: O[] },
  initial: S,
  inputs: GestureInput[],
): { state: S; out: O[]; states: S[] } {
  let state = initial;
  const out: O[] = [];
  const states: S[] = [];
  for (const i of inputs) {
    const r = step(state, i);
    state = r.state;
    out.push(...r.out);
    states.push(state);
  }
  return { state, out, states };
}

const down = (t: number): GestureInput => ({ type: 'down', t });
const move = (t: number, dx: number, dy: number): GestureInput => ({ type: 'move', t, dx, dy });
const up = (t: number, dx?: number, dy?: number): GestureInput =>
  dx === undefined ? { type: 'up', t } : { type: 'up', t, dx, dy: dy ?? 0 };
const tick = (t: number): GestureInput => ({ type: 'tick', t });

describe('aimed button (SPEC §15.7)', () => {
  const idle = aimedGesture().initial();
  const aimed = (inputs: GestureInput[]) =>
    run<AimedState, AimedOutput>((s, i) => aimedStep(s, i), idle, inputs);

  it.each<[string, GestureInput[], AimedOutput[]]>([
    ['released at 0 ms in place → tap', [down(0), up(0)], [{ kind: 'tap' }]],
    [
      'released at 150 ms in the dead zone → tap',
      [down(0), move(50, 3, 4), up(150, 3, 4)],
      [{ kind: 'tap' }],
    ],
    ['released at 151 ms without aiming → cancel', [down(0), up(151)], [{ kind: 'cancel' }]],
    [
      'dragged out and released outside the dead zone → fire with the aim',
      [down(0), move(40, 30, 0), up(300, 30, 40)],
      [{ kind: 'fire', x: 30, y: 40 }],
    ],
    [
      'a quick flick out is a fire, not a tap',
      [down(0), up(60, 40, 0)],
      [{ kind: 'fire', x: 40, y: 0 }],
    ],
    [
      'slid back into the dead zone, then released → cancel',
      [down(0), move(40, 50, 0), move(80, 2, 1), up(90)],
      [{ kind: 'cancel' }],
    ],
    [
      'pointer cancelled → cancel',
      [down(0), move(40, 50, 0), { type: 'cancel', t: 50 }],
      [{ kind: 'cancel' }],
    ],
  ])('%s', (_name, inputs, expected) => {
    const r = aimed(inputs);
    expect(r.out).toEqual(expected);
    expect(r.state.phase).toBe('idle');
  });

  it('pending → aiming once the drag leaves the dead zone (aim flag on)', () => {
    const r = aimed([down(0), move(10, 5, 0), move(20, 20, 0)]);
    expect(r.states.map((s) => s.phase)).toEqual(['pending', 'pending', 'aiming']);
    expect(isAiming(r.state)).toBe(true);
    // Back inside the dead zone it stays aiming (a release there cancels).
    expect(isAiming(aimedStep(r.state, move(30, 1, 0)).state)).toBe(true);
  });

  it('clamps the aim vector to 70 px', () => {
    const r = aimed([down(0), move(10, 300, 400)]);
    expect(Math.hypot(r.state.x, r.state.y)).toBeCloseTo(70);
    expect(r.state.x).toBeCloseTo(42);
    expect(r.state.y).toBeCloseTo(56);
    const fired = aimed([down(0), move(10, -500, 0), up(20, -500, 0)]).out[0];
    expect(fired).toEqual({ kind: 'fire', x: -70, y: 0 });
    expect(aimToStick(-70, 0, AIMED_DEFAULTS.maxPx)).toEqual([-100, 0]);
    expect(aimToStick(35, -17.5, 70)).toEqual([50, -25]);
  });

  it('ignores input while idle and a second down while pressed', () => {
    expect(aimed([move(0, 50, 0), up(10)]).out).toEqual([]);
    const r = aimed([down(0), move(10, 50, 0), down(20)]);
    expect(r.state.phase).toBe('aiming');
  });
});

describe('tap button (SPEC §15.7)', () => {
  it('fires on release only, once; a cancel fires nothing', () => {
    expect(run(tapStep, { pressed: false }, [down(0)]).out).toEqual([]);
    expect(run(tapStep, { pressed: false }, [down(0), tick(5000), up(5000)]).out).toEqual([
      { kind: 'tap' },
    ]);
    expect(
      run(tapStep, { pressed: false }, [down(0), { type: 'cancel', t: 9 }, up(10)]).out,
    ).toEqual([]);
  });
});

describe('radial button (SPEC §15.7)', () => {
  const structures: RadialConfig = {
    ...RADIAL_DEFAULTS,
    slots: [true, true, true, true], // left, up, right, Give (down)
  };
  const radial = (inputs: GestureInput[], cfg: RadialConfig = structures) =>
    run<RadialState, RadialOutput>(
      (s, i) => radialStep(s, i, cfg),
      radialGesture(cfg).initial(),
      inputs,
    );

  it.each<[string, GestureInput[], RadialOutput[]]>([
    ['a tap within 150 ms → tap', [down(0), up(150)], [{ kind: 'tap' }]],
    ['released at 200 ms, not open → cancel', [down(0), up(200)], [{ kind: 'cancel' }]],
    ['held 0.4 s → open', [down(0), tick(400)], [{ kind: 'open' }]],
    ['dragged out early → open with the slot', [down(0), move(50, 0, -30)], [{ kind: 'open' }]],
    [
      'released on a slot → commit',
      [down(0), move(50, 30, 0), up(200, 30, 0)],
      [{ kind: 'open' }, { kind: 'commit', slot: SLOT_RIGHT, repeat: false }],
    ],
    [
      'held open, released in the dead zone → cancel',
      [down(0), tick(400), up(900, 2, 2)],
      [{ kind: 'open' }, { kind: 'cancel' }],
    ],
    [
      'dragged out, back into the dead zone, released → cancel',
      [down(0), move(50, -30, 0), move(100, 1, 0), up(120)],
      [{ kind: 'open' }, { kind: 'cancel' }],
    ],
  ])('%s', (_name, inputs, expected) => {
    expect(radial(inputs).out).toEqual(expected);
  });

  it('the open state carries the radial flag and the selected slot', () => {
    const r = radial([down(0), move(50, 0, -30)]);
    expect(isRadialOpen(r.state)).toBe(true);
    expect(r.state.slot).toBe(SLOT_UP);
    expect(radial([down(0), tick(400)]).state.slot).toBe(SLOT_NONE);
  });

  it('picks only enabled slots by drag direction', () => {
    const dimmedRight: RadialConfig = { ...structures, slots: [true, true, false, true] };
    expect(pickSlot(40, 0, SLOT_NONE, structures)).toBe(SLOT_RIGHT);
    expect(pickSlot(-40, 0, SLOT_NONE, structures)).toBe(SLOT_LEFT);
    expect(pickSlot(0, 40, SLOT_NONE, structures)).toBe(SLOT_DOWN);
    // Right is dimmed: a drag to the right picks the nearest enabled direction instead.
    expect(pickSlot(40, -5, SLOT_NONE, dimmedRight)).toBe(SLOT_UP);
    // Releasing on a dimmed slot can't happen: it is never selected.
    const r = radial([down(0), move(50, 40, -5), up(200, 40, -5)], dimmedRight);
    expect(r.out.at(-1)).toEqual({ kind: 'commit', slot: SLOT_UP, repeat: false });
    // Inside the dead zone → none.
    expect(pickSlot(3, 3, SLOT_UP, structures)).toBe(SLOT_NONE);
  });

  it('8 px hysteresis between slots', () => {
    // From right, sweeping toward up: stays right until up leads by 8 px.
    let s = radial([down(0), move(10, 40, 0)]).state;
    expect(s.slot).toBe(SLOT_RIGHT);
    s = radialStep(s, move(20, 30, -35), structures).state; // up leads by 5
    expect(s.slot).toBe(SLOT_RIGHT);
    s = radialStep(s, move(30, 30, -37.9), structures).state; // leads by 7.9
    expect(s.slot).toBe(SLOT_RIGHT);
    s = radialStep(s, move(40, 30, -38), structures).state; // leads by 8
    expect(s.slot).toBe(SLOT_UP);
    // And back: right must lead up by 8 px again.
    s = radialStep(s, move(50, 35, -30), structures).state;
    expect(s.slot).toBe(SLOT_UP);
    s = radialStep(s, move(60, 40, -30), structures).state;
    expect(s.slot).toBe(SLOT_RIGHT);
  });

  it('held on Give → repeat commits every 300 ms; release after repeats only ends', () => {
    const r = radial([
      down(0),
      move(50, 0, 40),
      tick(349),
      tick(350),
      tick(650),
      tick(955),
      up(1000, 0, 40),
    ]);
    expect(r.out).toEqual([
      { kind: 'open' },
      { kind: 'commit', slot: SLOT_DOWN, repeat: true },
      { kind: 'commit', slot: SLOT_DOWN, repeat: true },
      { kind: 'commit', slot: SLOT_DOWN, repeat: true },
      { kind: 'end' },
    ]);
    // A late tick catches up on every repeat that was due.
    const late = radial([down(0), move(50, 0, 40), tick(1000)]);
    expect(late.out.filter((o) => o.kind === 'commit').length).toBe(3);
    // Released on Give before the first repeat → one plain commit.
    expect(radial([down(0), move(50, 0, 40), up(200, 0, 40)]).out.at(-1)).toEqual({
      kind: 'commit',
      slot: SLOT_DOWN,
      repeat: false,
    });
    // Leaving Give stops the repeats; coming back restarts the 300 ms.
    const away = radial([
      down(0),
      move(50, 0, 40),
      move(300, 40, 0),
      tick(700),
      move(700, 0, 40),
      tick(999),
      tick(1000),
    ]);
    expect(away.out.filter((o) => o.kind === 'commit')).toEqual([
      { kind: 'commit', slot: SLOT_DOWN, repeat: true },
    ]);
  });

  it('single slot (Give only): holding 0.4 s commits Give directly and repeats', () => {
    const giveOnly: RadialConfig = { ...RADIAL_DEFAULTS, slots: [null, null, null, true] };
    const r = radial([down(0), tick(399), tick(400), tick(700), tick(1000), up(1100)], giveOnly);
    expect(r.out).toEqual([
      { kind: 'commit', slot: SLOT_DOWN, repeat: false },
      { kind: 'commit', slot: SLOT_DOWN, repeat: true },
      { kind: 'commit', slot: SLOT_DOWN, repeat: true },
      { kind: 'end' },
    ]);
    // Never opens the arc, even when dragged.
    const dragged = radial([down(0), move(50, 0, 60)], giveOnly);
    expect(isRadialOpen(dragged.state)).toBe(false);
    // A tap is still a tap (the button's normal action).
    expect(radial([down(0), up(100)], giveOnly).out).toEqual([{ kind: 'tap' }]);
    // Give unavailable (dimmed): holding does nothing; the release cancels.
    const dimmed: RadialConfig = { ...giveOnly, slots: [null, null, null, false] };
    expect(radial([down(0), tick(2000), up(2000)], dimmed).out).toEqual([{ kind: 'cancel' }]);
  });
});

describe('bindGesture (DOM adapter)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    document.body.innerHTML = '';
  });
  afterEach(() => vi.useRealTimers());

  it('feeds pointer offsets to the aimed machine', () => {
    const btn = document.createElement('div');
    document.body.append(btn);
    const outs: AimedOutput[] = [];
    const phases: string[] = [];
    bindGesture(btn, aimedGesture(), {
      onOutput: (o) => outs.push(o),
      onState: (s) => phases.push(s.phase),
    });
    pointer(btn, 'pointerdown', 1, 100, 100);
    expect(btn.classList.contains('pressed')).toBe(true);
    pointer(btn, 'pointermove', 1, 150, 100);
    vi.advanceTimersByTime(200);
    pointer(btn, 'pointerup', 1, 150, 100);
    expect(outs).toEqual([{ kind: 'fire', x: 50, y: 0 }]);
    expect(phases).toEqual(['pending', 'aiming', 'idle']);
    expect(btn.classList.contains('pressed')).toBe(false);
  });

  it('delivers hold and repeat ticks on time (radial, fake timers)', () => {
    const btn = document.createElement('div');
    document.body.append(btn);
    const outs: RadialOutput[] = [];
    const slots: (boolean | null)[] = [null, null, null, true];
    bindGesture(
      btn,
      radialGesture(() => ({ ...RADIAL_DEFAULTS, slots })),
      {
        onOutput: (o) => outs.push(o),
      },
    );
    pointer(btn, 'pointerdown', 1, 0, 0);
    vi.advanceTimersByTime(399);
    expect(outs).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(outs).toEqual([{ kind: 'commit', slot: SLOT_DOWN, repeat: false }]);
    vi.advanceTimersByTime(600);
    expect(outs.length).toBe(3);
    pointer(btn, 'pointerup', 1, 0, 0);
    vi.advanceTimersByTime(2000);
    expect(outs.at(-1)).toEqual({ kind: 'end' });
    expect(outs.length).toBe(4);
  });

  it('tracks one pointer; reset drops the gesture silently', () => {
    const btn = document.createElement('div');
    document.body.append(btn);
    const outs: AimedOutput[] = [];
    const b = bindGesture(btn, aimedGesture(), { onOutput: (o) => outs.push(o) });
    pointer(btn, 'pointerdown', 1, 0, 0);
    pointer(btn, 'pointerdown', 2, 0, 0);
    pointer(btn, 'pointerup', 2, 90, 0);
    expect(outs).toEqual([]);
    b.reset();
    pointer(btn, 'pointerup', 1, 0, 0);
    expect(outs).toEqual([]);
    expect(b.state().phase).toBe('idle');
    b.destroy();
  });
});
