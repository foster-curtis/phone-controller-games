// The play surface, shared by the `countdown`, `playing` and `ghost` screens so a held thumb survives
// the transitions. Left half: floating joystick. Right half: pause (hold), DASH, SLAM.
import { el } from '../dom';
import { BUTTON_DASH, BUTTON_SLAM, type Screen } from '../../shared/messages';
import { createChargeFill, createHoldButton } from '../input/buttons';
import { createHoldToPause } from '../input/holdToPause';
import { createJoystick } from '../input/joystick';
import { colorOnVar, colorVar, type ScreenCtx, type ScreenView } from './common';

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
  const dashPad = el(
    'div',
    { class: 'pad-zone dash', 'data-pad': 'dash' },
    el('div', { class: 'pad-btn pad' }, el('span', { class: 'pad-label', text: 'DASH' })),
  );
  const slamFill = el('div', { class: 'pad-fill' });
  const slamPad = el(
    'div',
    { class: 'pad-zone slam', 'data-pad': 'slam' },
    el('div', { class: 'pad-btn pad' }, slamFill, el('span', { class: 'pad-label', text: 'SLAM' })),
  );
  // Ghosts get ONE grey pulse button; it sends the DASH bit (the host sim pulses on dash or slam).
  const pulsePad = el(
    'div',
    { class: 'pad-zone pulse', 'data-pad': 'pulse' },
    el('div', { class: 'pad-btn pad' }, el('span', { class: 'pad-label', text: 'PULSE' })),
  );
  const pads = el('div', { class: 'pads' }, dashPad, slamPad);
  const right = el('div', { class: 'play-right' }, el('div', { class: 'pause-row' }, pause), pads);
  const countdown = el('div', { class: 'play-countdown title', 'aria-live': 'polite' });
  root.append(stickZone, right, countdown);

  const stick = createJoystick(stickZone, { onChange: (x, y) => ctx.sender.setStick(x, y) });
  const fill = createChargeFill(slamFill);
  const dash = createHoldButton(dashPad, (down) => ctx.sender.setButton(BUTTON_DASH, down));
  const slam = createHoldButton(slamPad, (down) => {
    ctx.sender.setButton(BUTTON_SLAM, down);
    if (down) fill.press();
    else fill.release();
  });
  const pulse = createHoldButton(pulsePad, (down) => ctx.sender.setButton(BUTTON_DASH, down));
  const hold = createHoldToPause(pause, () => ctx.onPause());

  const apply = (s: PlaySurface) => {
    root.dataset.screen = s.kind;
    const want = s.kind === 'ghost' ? [pulsePad] : [dashPad, slamPad];
    if (pads.children.length !== want.length || pads.firstElementChild !== want[0]) {
      pads.replaceChildren(...want);
    }
    root.style.setProperty('--pad-bg', colorVar(s.color));
    root.style.setProperty('--pad-on', colorOnVar(s.color));
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
      fill.destroy();
      dash.destroy();
      pulse.destroy();
      slam.destroy();
      hold.destroy();
    },
  };
}
