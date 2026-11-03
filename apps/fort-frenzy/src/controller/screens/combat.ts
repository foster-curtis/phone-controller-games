// Combat controller (SPEC §10.1, §10.4, §15.7): stick on the left half, main / super / action on the
// right per `layoutCombat`, the charge ring, the status strip. `dead` shares this view (a held thumb
// survives the switch) and shows the respawn countdown only.
import {
  RADIAL_DEFAULTS,
  SLOT_DOWN,
  aimedGesture,
  bindGesture,
  createJoystick,
  el,
  radialGesture,
  readSafeInsets,
  tapGesture,
  type GestureBinding,
  type Joystick,
  type RadialConfig,
} from '@pcg/controller-kit';
import type { ClassId } from '../../shared/ids';
import type { MeView } from '../../shared/messages';
import { mountAimZones, type AimZones } from '../aimZones';
import { ChargeRing, RoundButton, StatusStrip } from '../components';
import { CLASS_INFO, actionIcon, giveIcon } from '../copy';
import {
  encodeAimed,
  encodeAimedState,
  encodeRadial,
  encodeRadialState,
  encodeTapAttack,
  type AttackKey,
  type PhoneSender,
} from '../input';
import {
  layoutCombat,
  STICK_BASE_D,
  STICK_KNOB_D,
  type Circle,
  type CombatLayout,
} from '../layout';
import { createCountdown, formatClock, type ScreenCtx, type Snapshot, type View } from './common';

/** Radial slots from the host's arc (left, up, right, down): null absent, false dimmed, true enabled. */
export function arcSlots(arc: MeView['arc']): (boolean | null)[] {
  return [0, 1, 2, 3].map((i) => {
    const s = arc?.slots[i];
    return s === undefined || s === null ? null : (arc?.enabled[i] ?? false);
  });
}

/** The floating stick on the left half; `place` sets its resting spot (viewport px). */
export function mountStick(
  parent: HTMLElement,
  sender: PhoneSender,
): { zone: HTMLElement; place(c: Circle): void; destroy(): void } {
  const zone = el('div', { class: 'stick-zone', 'data-zone': 'stick' });
  parent.append(zone);
  const stick: Joystick = createJoystick(zone, {
    radius: STICK_BASE_D / 2,
    deadzone: 0.12,
    idleOpacity: 0.4,
    easeBackMs: 150,
    onChange: (x, y) => sender.update({ moveX: x, moveY: y }),
    onTouch: (down) => sender.touch('stick', down),
  });
  return {
    zone,
    place(c) {
      zone.style.setProperty('--stick-x', `${c.cx}px`);
      zone.style.setProperty('--stick-y', `${c.cy}px`);
      zone.style.setProperty('--stick-d', `${STICK_BASE_D}px`);
      zone.style.setProperty('--knob-d', `${STICK_KNOB_D}px`);
    },
    destroy() {
      stick.destroy();
      zone.remove();
    },
  };
}

/** Binds an attack button: aimed (drag to aim, release to fire) or tap (fires on release). */
export function bindAttack(
  btn: HTMLElement,
  sender: PhoneSender,
  key: AttackKey,
  mode: 'tap' | 'aim',
): GestureBinding<unknown> {
  if (mode === 'aim') {
    return bindGesture(btn, aimedGesture(), {
      onState: (st) => {
        encodeAimedState(sender, key, st);
        sender.touch(key, st.phase !== 'idle');
      },
      onOutput: (out) => encodeAimed(sender, key, out),
    });
  }
  return bindGesture(btn, tapGesture(), {
    onState: (st) => sender.touch(key, st.pressed),
    onOutput: () => encodeTapAttack(sender, key),
  });
}

/**
 * Binds the action button: tap = its action; hold ~0.4 s or drag = the build arc (Engineer, Warden) or
 * Give directly (Quartermaster, Commander), per the latest `me.arc` (SPEC §10.1).
 */
export function bindAction(
  btn: HTMLElement,
  sender: PhoneSender,
  getArc: () => MeView['arc'],
  onGiving: (giving: boolean) => void,
): GestureBinding<unknown> {
  const cfg = (): RadialConfig => ({ ...RADIAL_DEFAULTS, slots: arcSlots(getArc()) });
  return bindGesture(btn, radialGesture(cfg), {
    onState: (st) => {
      const hasSlots = cfg().slots.some((s) => s !== null);
      encodeRadialState(sender, st, hasSlots);
      sender.touch('action', st.phase !== 'idle');
      onGiving(st.slot === SLOT_DOWN && st.phase !== 'idle');
    },
    onOutput: (out, st) => encodeRadial(sender, out, st),
  });
}

export function createCombat(ctx: ScreenCtx): View {
  const root = el('section', { class: 'screen combat' });
  const strip = StatusStrip();
  const stick = mountStick(root, ctx.sender);
  const main = RoundButton('main', 'main-ranger');
  const sup = RoundButton('super', 'super-ranger');
  const action = RoundButton('action', 'act-pickup');
  const ring = ChargeRing();
  for (const b of [main, sup]) b.el.append(el('span', { class: 'aim-ring' }));
  main.label('ATTACK');
  sup.label('SUPER');
  action.label('ACTION');
  sup.el.append(ring.el);
  const dead = el(
    'div',
    { class: 'dead-overlay' },
    el('p', { class: 'tag', text: 'DOWN' }),
    el('p', { class: 'score dead-clock' }),
    el('p', { class: 'body', text: 'Respawning…' }),
  );
  const clock = dead.querySelector('.dead-clock') as HTMLElement;
  root.append(strip.el, main.el, sup.el, action.el, dead);
  root.append(el('span', { class: 'zone-label', text: 'MOVE' }));

  let me: MeView | null = null;
  let boundClass: ClassId | null = null;
  let bindings: GestureBinding<unknown>[] = [];
  const countdown = createCountdown(clock, formatClock, ctx.now);

  let layout: CombatLayout = layoutCombat({ width: innerWidth, height: innerHeight });
  // Aimed attacks are floating joysticks over the right half (FF4-fix-2); taps and radials stay put.
  const zones: AimZones = mountAimZones(root, {
    sender: ctx.sender,
    getLayout: () => layout,
    buttons: { main: main.el, super: sup.el },
  });
  const place = () => {
    const l = layoutCombat(
      { width: root.clientWidth || innerWidth, height: root.clientHeight || innerHeight },
      readSafeInsets(),
    );
    layout = l;
    stick.place(l.stick);
    main.place(l.main.cx, l.main.cy, l.main.d);
    sup.place(l.super.cx, l.super.cy, l.super.d);
    action.place(l.action.cx, l.action.cy, l.action.d);
    ring.el.style.setProperty('--ring-d', `${l.super.d + 16}px`);
    root.style.setProperty('--zone-label-x', `${l.stick.cx}px`);
    root.style.setProperty('--zone-label-y', `${l.stick.cy + l.stick.d / 2 + 8}px`);
  };
  const onResize = () => place();
  window.addEventListener('resize', onResize);
  place();

  const giving = (on: boolean) => {
    if (!me) return;
    const i = on ? giveIcon(me.give) : actionIcon(me.action);
    action.setIcon(i.id, i.dimmed);
  };

  const bind = (classId: ClassId) => {
    for (const b of bindings) b.destroy();
    const info = CLASS_INFO[classId];
    const aimed = (['main', 'super'] as const).filter((k) => info[k].mode === 'aim');
    zones.setAimed(aimed);
    for (const [k, b] of [
      ['main', main],
      ['super', sup],
    ] as const) {
      b.el.classList.toggle('aim', info[k].mode === 'aim');
    }
    bindings = [
      ...(['main', 'super'] as const)
        .filter((k) => info[k].mode === 'tap')
        .map((k) => bindAttack((k === 'main' ? main : sup).el, ctx.sender, k, 'tap')),
      bindAction(action.el, ctx.sender, () => me?.arc ?? null, giving),
    ];
    boundClass = classId;
  };

  const update = ({ me: m, team }: Snapshot) => {
    me = m;
    const cls = m.classId ?? 'engineer';
    if (boundClass !== cls) {
      bind(cls);
      const info = CLASS_INFO[cls];
      main.setIcon(`main-${info.rig}`);
      sup.setIcon(`super-${info.rig}`);
    }
    const isDead = m.screen === 'dead';
    root.classList.toggle('is-dead', isDead);
    if (isDead) {
      for (const b of bindings) b.reset();
      zones.reset();
      ctx.sender.neutral();
      countdown.set(m.respawnMs);
    } else {
      countdown.set(null);
    }
    strip.update(m, team);
    ring.set(m.superCharge, m.superReady);
    const a = actionIcon(m.action);
    action.setIcon(a.id, a.dimmed);
    action.el.classList.toggle('kit', m.action === 'kit');
  };

  return {
    el: root,
    update,
    destroy() {
      window.removeEventListener('resize', onResize);
      for (const b of bindings) b.destroy();
      zones.destroy();
      countdown.destroy();
      stick.destroy();
      ctx.sender.neutral();
    },
  };
}
