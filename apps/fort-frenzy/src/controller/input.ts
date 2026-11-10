// Phone input: the 12-field tuple schema on the kit's fixed-rate sender (SPEC §15.6) and the encoding
// of each gesture outcome into it (§10.1, §15.7). Gestures resolve on the phone; a release goes out at
// once, so a fire and its aim arrive together.
import {
  aimedGesture,
  createInputSender,
  isAiming,
  isRadialOpen,
  SLOT_NONE,
  type AimedOutput,
  type AimedState,
  type InputSender,
  type RadialOutput,
  type RadialState,
} from '@pcg/controller-kit';
import {
  AIM_DEAD_ZONE,
  INPUT_FLAG_MAIN_AIMING,
  INPUT_FLAG_RADIAL_OPEN,
  INPUT_FLAG_SUPER_AIMING,
} from '../shared/messages';

export const TUPLE_LAYOUT = [
  'moveX',
  'moveY',
  'mainX',
  'mainY',
  'superX',
  'superY',
  'flags',
  'mainFires',
  'superFires',
  'actionTaps',
  'radialCommits',
  'radialSlot',
] as const;
export type TupleSlot = (typeof TUPLE_LAYOUT)[number];
export type PhoneSender = InputSender<TupleSlot>;

/** Maximum aim drag, px (the aimed gesture's clamp). */
export const AIM_MAX_PX = 70;

/**
 * The aimed buttons' center grace zone, px (FF7-fix-5, C4): a release inside it cancels. The sim hides
 * the TV preview by the same fraction (`AIM_DEAD_ZONE`), so phone and TV agree.
 */
export const AIM_DEAD_ZONE_PX = AIM_DEAD_ZONE * AIM_MAX_PX;

/** Every aimed button's gesture machine: the kit's rule with Fort Frenzy's clamp and grace zone. */
export function aimGesture(): ReturnType<typeof aimedGesture> {
  return aimedGesture({ maxPx: AIM_MAX_PX, deadZonePx: AIM_DEAD_ZONE_PX });
}

const AIM_SCALE = 100;
/** The grace zone in tuple ints, squared (an exact integer compare). */
const DEAD_INT_SQ = (AIM_DEAD_ZONE * AIM_SCALE) ** 2;

/**
 * px aim → tuple ints on the same side of the grace zone as the phone's own px test, so rounding never
 * shows a line the phone would cancel or hides one it would fire (FF7-fix-5): inside rounds toward
 * zero; outside rounds away from zero when plain rounding would land on or in the edge.
 */
export function aimInts(x: number, y: number): [number, number] {
  const sx = (x / AIM_MAX_PX) * AIM_SCALE;
  const sy = (y / AIM_MAX_PX) * AIM_SCALE;
  if (Math.hypot(x, y) <= AIM_DEAD_ZONE_PX) return [Math.trunc(sx) || 0, Math.trunc(sy) || 0];
  const rx = Math.round(sx) || 0;
  const ry = Math.round(sy) || 0;
  if (rx * rx + ry * ry > DEAD_INT_SQ) return [rx, ry];
  const away = (v: number) => Math.sign(v) * Math.ceil(Math.abs(v)) || 0;
  return [away(sx), away(sy)];
}

export function createPhoneSender(send: (tuple: number[]) => void): PhoneSender {
  return createInputSender<TupleSlot>(
    {
      layout: TUPLE_LAYOUT,
      analog: ['moveX', 'moveY'],
      counters: ['mainFires', 'superFires', 'actionTaps', 'radialCommits'],
      buttons: { slot: 'flags' },
      initial: { radialSlot: SLOT_NONE },
      // 30 Hz while a control is touched, 5 Hz idle (SPEC §11.4).
      mode: { kind: 'fixedRate', activeHz: 30, idleHz: 5 },
    },
    send,
  );
}

export type AttackKey = 'main' | 'super';

const ATTACK = {
  main: { x: 'mainX', y: 'mainY', fires: 'mainFires', flag: INPUT_FLAG_MAIN_AIMING },
  super: { x: 'superX', y: 'superY', fires: 'superFires', flag: INPUT_FLAG_SUPER_AIMING },
} as const;

/** Aimed press state → the aiming flag (the TV draws the aim line while it is set). */
export function encodeAimedState(sender: PhoneSender, key: AttackKey, state: AimedState): void {
  const aiming = isAiming(state);
  sender.setButton(ATTACK[key].flag, aiming);
  // The live aim rides along while aiming, so the TV's line follows the thumb (FF7: the sim reads
  // `mainAim` as the held aim; the release still sends its final aim with the fire).
  if (aiming) {
    const a = ATTACK[key];
    const [x, y] = aimInts(state.x, state.y);
    sender.update({ [a.x]: x, [a.y]: y });
  }
}

/** An aimed outcome: tap = fire with aim 0,0 (auto-aim), fire = the aim, cancel = nothing. */
export function encodeAimed(sender: PhoneSender, key: AttackKey, out: AimedOutput): void {
  const a = ATTACK[key];
  if (out.kind === 'tap') sender.bump(a.fires, { [a.x]: 0, [a.y]: 0 });
  else if (out.kind === 'fire') {
    const [x, y] = aimInts(out.x, out.y);
    sender.bump(a.fires, { [a.x]: x, [a.y]: y });
  }
}

/** A tap-type attack fires on release, aim 0,0. */
export function encodeTapAttack(sender: PhoneSender, key: AttackKey): void {
  const a = ATTACK[key];
  sender.bump(a.fires, { [a.x]: 0, [a.y]: 0 });
}

/** Radial state → the radial-open flag and the slot being hovered (arc open only). */
export function encodeRadialState(
  sender: PhoneSender,
  state: RadialState,
  hasSlots: boolean,
): void {
  const open = hasSlots && isRadialOpen(state);
  sender.setButton(INPUT_FLAG_RADIAL_OPEN, open);
  sender.update({ radialSlot: open ? state.slot : SLOT_NONE });
}

/** A radial outcome: tap = the action button, commit = slot + counter, cancel/end = no slot. */
export function encodeRadial(sender: PhoneSender, out: RadialOutput, state: RadialState): void {
  switch (out.kind) {
    case 'tap':
      sender.bump('actionTaps');
      break;
    case 'commit':
      sender.bump('radialCommits', { radialSlot: out.slot });
      // The state is idle after a release commit; a repeat while held keeps its slot.
      if (state.phase === 'idle') sender.update({ radialSlot: SLOT_NONE });
      break;
    case 'cancel':
    case 'end':
      sender.update({ radialSlot: SLOT_NONE });
      break;
    case 'open':
      break;
  }
}
