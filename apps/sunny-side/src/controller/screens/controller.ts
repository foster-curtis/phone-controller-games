// The play surface, shared by the `countdown`, `playing` and `ghost` screens so a held thumb survives
// the transitions. Left half: floating joystick (rests bottom-left). Right half: DASH (up/left) and
// SLAM (down/right) zones, or one PULSE zone for ghosts. The pause button lives in the top banner.
import { el } from '../dom';
import { BUTTON_DASH, BUTTON_SLAM, type Screen } from '../../shared/messages';
import { createChargeArc, createHoldButton } from '../input/buttons';
import { createHoldToPause } from '../input/holdToPause';
import { createJoystick } from '../input/joystick';
import { colorVar, type ScreenCtx, type ScreenView } from './common';

type PlaySurface = Extract<Screen, { kind: 'countdown' | 'playing' | 'ghost' }>;

export function createController(ctx: ScreenCtx, first: PlaySurface): ScreenView<PlaySurface> {
  const root = el('section', { class: 'screen play', 'data-screen': first.kind });
  const stickZone = el('div', { class: 'stick-zone' });
  const pause = el(
    'button',
    { type: 'button', class: 'pause-btn', 'aria-label': 'Hold to pause' },
    el('span', { class: 'pause-ring' }),
    el('span', { class: 'pause-icon', 'aria-hidden': 'true' }),
  );
  ctx.pauseSlot.append(pause);
  const dashPad = el(
    'div',
    { class: 'pad-zone dash', 'data-pad': 'dash' },
    el('div', { class: 'pad-btn pad' }, el('span', { class: 'pad-label', text: 'DASH' })),
  );
  const slamBtn = el(
    'div',
    { class: 'pad-btn pad' },
    el('span', { class: 'pad-label', text: 'SLAM' }),
  );
  const slamPad = el('div', { class: 'pad-zone slam', 'data-pad': 'slam' }, slamBtn);
  // Ghosts get ONE grey pulse button; it sends the DASH bit (the host sim pulses on dash or slam).
  const pulsePad = el(
    'div',
    { class: 'pad-zone pulse', 'data-pad': 'pulse' },
    el('div', { class: 'pad-btn pad' }, el('span', { class: 'pad-label', text: 'PULSE' })),
  );
  const pads = el('div', { class: 'pads' }, dashPad, slamPad);
  const right = el('div', { class: 'play-right' }, pads);
  const countdown = el('div', { class: 'play-countdown title', 'aria-live': 'polite' });
  root.append(stickZone, right, countdown);

  const stick = createJoystick(stickZone, { onChange: (x, y) => ctx.sender.setStick(x, y) });
  const arc = createChargeArc(slamBtn);
  const dash = createHoldButton(dashPad, (down) => ctx.sender.setButton(BUTTON_DASH, down));
  const slam = createHoldButton(slamPad, (down) => {
    ctx.sender.setButton(BUTTON_SLAM, down);
    if (down) arc.press();
    else arc.release();
  });
  const pulse = createHoldButton(pulsePad, (down) => ctx.sender.setButton(BUTTON_DASH, down));
  const hold = createHoldToPause(pause, () => ctx.onPause());

  const apply = (s: PlaySurface) => {
    root.dataset.screen = s.kind;
    const want = s.kind === 'ghost' ? [pulsePad] : [dashPad, slamPad];
    if (pads.children.length !== want.length || pads.firstElementChild !== want[0]) {
      pads.replaceChildren(...want);
      // The SLAM pad left the surface: its charge arc must not linger.
      if (s.kind === 'ghost') arc.release();
    }
    // The joystick knob keeps the player's color; the pads deliberately do not (M5-fix-3).
    stickZone.style.setProperty('--stick-bg', colorVar(s.color));
    countdown.hidden = s.kind !== 'countdown';
    countdown.textContent =
      s.kind === 'countdown' ? String(Math.max(1, Math.ceil(s.ms / 1000))) : '';
  };
  apply(first);
  ctx.sender.start();

  return {
    el: root,
    update: apply,
    destroy() {
      ctx.sender.neutral();
      ctx.sender.stop();
      stick.destroy();
      arc.destroy();
      arc.svg.remove();
      dash.destroy();
      pulse.destroy();
      slam.destroy();
      hold.destroy();
      pause.remove();
    },
  };
}
