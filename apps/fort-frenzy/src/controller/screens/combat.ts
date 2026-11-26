// Combat controller (SPEC §10.1, §10.4, §15.7): stick on the left half, main / super / build on the
// right per `layoutCombat`, the super's charge ring, the build meter ring, the status strip. `dead` shares this view (a held thumb
// survives the switch) and shows the respawn countdown only.
import {
  bindGesture,
  createJoystick,
  el,
  readSafeInsets,
  tapGesture,
  type GestureBinding,
  type Joystick,
} from '@pcg/controller-kit';
import type { ClassId } from '../../shared/ids';
import type { MeView } from '../../shared/messages';
import { mountAimZones, type AimZones } from '../aimZones';
import { ChargeRing, RoundButton, StatusStrip } from '../components';
import { CLASS_INFO } from '../copy';
import {
  aimGesture,
  encodeAimed,
  encodeAimedState,
  encodeBuildTap,
  type AimKey,
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
import {
  createCountdown,
  createPauseControl,
  formatClock,
  type ScreenCtx,
  type Snapshot,
  type View,
} from './common';

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
    return bindGesture(btn, aimGesture(), {
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

/** The build button's enabled state: dimmed and inert while nothing can be placed or recalled. */
export function buildEnabled(build: MeView['build']): boolean {
  return build !== null && build.mode !== 'none';
}

/** Binds a tap-type build button: a release while enabled fires `buildFires`, aim 0,0 (SPEC §10.1). */
export function bindBuild(
  btn: HTMLElement,
  sender: PhoneSender,
  isEnabled: () => boolean,
): GestureBinding<unknown> {
  return bindGesture(btn, tapGesture(), {
    onState: (st) => sender.touch('action', st.pressed),
    onOutput: () => {
      if (isEnabled()) encodeBuildTap(sender);
    },
  });
}

export function createCombat(ctx: ScreenCtx): View {
  const root = el('section', { class: 'screen combat' });
  const strip = StatusStrip();
  const stick = mountStick(root, ctx.sender);
  const main = RoundButton('main', 'main-ranger');
  const sup = RoundButton('super', 'super-ranger');
  const action = RoundButton('action', 'act-shield');
  const ring = ChargeRing();
  const buildRing = ChargeRing('build');
  for (const b of [main, sup, action]) b.el.append(el('span', { class: 'aim-ring' }));
  main.label('ATTACK');
  sup.label('SUPER');
  action.label('BUILD');
  sup.el.append(ring.el);
  action.el.append(buildRing.el);
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
  const pause = createPauseControl(ctx);
  let wasPaused = false;

  let me: MeView | null = null;
  let boundKey: string | null = null;
  let bindings: GestureBinding<unknown>[] = [];
  const countdown = createCountdown(clock, formatClock, ctx.now);

  let layout: CombatLayout = layoutCombat({ width: innerWidth, height: innerHeight });
  // Aimed attacks are floating joysticks over the right half (FF4-fix-2); taps stay put.
  const zones: AimZones = mountAimZones(root, {
    sender: ctx.sender,
    getLayout: () => layout,
    buttons: { main: main.el, super: sup.el, build: action.el },
    // A dimmed button takes no aimed touch (SPEC §10.1: a build before the meter is full; the
    // Commander's super at his squad cap, §8.4).
    enabled: (k) =>
      k === 'build' ? buildEnabled(me?.build ?? null) : k !== 'super' || !me?.superBlocked,
  });
  // After the aim zones, so the top bar's pause button and the paused card sit above them.
  root.append(pause.button, pause.layer);
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
    root.style.setProperty('--zone-label-x', `${l.stick.cx}px`);
    root.style.setProperty('--zone-label-y', `${l.stick.cy + l.stick.d / 2 + 8}px`);
  };
  const onResize = () => place();
  window.addEventListener('resize', onResize);
  place();

  // The build button swaps gestures when `me.build.input` changes (the Commander's recall): rebind on it.
  const bind = (classId: ClassId, buildInput: 'aimed' | 'tap') => {
    for (const b of bindings) b.destroy();
    const info = CLASS_INFO[classId];
    const aimed: AimKey[] = (['main', 'super'] as const).filter((k) => info[k].mode === 'aim');
    if (buildInput === 'aimed') aimed.push('build');
    zones.setAimed(aimed);
    action.el.classList.toggle('aim', buildInput === 'aimed');
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
      ...(buildInput === 'tap'
        ? [bindBuild(action.el, ctx.sender, () => buildEnabled(me?.build ?? null))]
        : []),
    ];
    boundKey = `${classId}|${buildInput}`;
  };

  const update = (s: Snapshot) => {
    const { me: m, team } = s;
    me = m;
    // Paused (FF14-fix-1): drop every held gesture so nothing fires once the run resumes.
    const isPaused = pause.set(s);
    if (isPaused && !wasPaused) {
      for (const b of bindings) b.reset();
      zones.reset();
      ctx.sender.neutral();
    }
    wasPaused = isPaused;
    const cls = m.classId ?? 'ranger';
    const buildInput = m.build?.input ?? 'tap';
    if (boundKey !== `${cls}|${buildInput}`) {
      bind(cls, buildInput);
      const info = CLASS_INFO[cls];
      main.setIcon(`main-${info.rig}`);
      sup.setIcon(`super-${info.rig}`, m.superBlocked);
    }
    sup.el.classList.toggle('dimmed', m.superBlocked);
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
    action.setIcon(m.build?.icon ?? 'act-shield', !buildEnabled(m.build));
    buildRing.set(m.build?.meter ?? 0, m.build?.full ?? false);
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
