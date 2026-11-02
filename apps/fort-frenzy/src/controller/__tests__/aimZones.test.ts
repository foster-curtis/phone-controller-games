import { describe, expect, it } from 'vitest';
import { mountAimZones } from '../aimZones';
import { createPhoneSender } from '../input';
import { layoutCombat } from '../layout';

const layout = layoutCombat({ width: 844, height: 390 });

function setup(aimed: ('main' | 'super')[] = ['main', 'super']) {
  const parent = document.createElement('div');
  document.body.append(parent);
  const sender = createPhoneSender(() => {});
  const main = document.createElement('div');
  const sup = document.createElement('div');
  const zones = mountAimZones(parent, {
    sender,
    getLayout: () => layout,
    buttons: { main, super: sup },
  });
  zones.setAimed(aimed);
  const fire = (type: string, x: number, y: number, id = 1) => {
    const e = new MouseEvent(type, { clientX: x, clientY: y, bubbles: true, cancelable: true });
    Object.defineProperty(e, 'pointerId', { value: id });
    zones.el.dispatchEvent(e);
  };
  return { sender, main, sup, zones, fire };
}

describe('floating aimed zones (FF4-fix-2)', () => {
  it('a touch near the main button picks main and centers the joystick on the finger', () => {
    const { main, sup, fire } = setup();
    const x = layout.main.cx + 20;
    const y = layout.main.cy - 10;
    fire('pointerdown', x, y);
    expect(main.classList.contains('floating')).toBe(true);
    expect(sup.classList.contains('floating')).toBe(false);
    expect(main.style.getPropertyValue('--fx')).toBe(`${x - layout.main.cx}px`);
    expect(main.style.getPropertyValue('--fy')).toBe(`${y - layout.main.cy}px`);
  });

  it('the bounds between buttons pick the nearer one', () => {
    const { main, sup, fire } = setup();
    // Just on the super side of the line between main and super.
    const t = 0.7;
    fire(
      'pointerdown',
      layout.main.cx + (layout.super.cx - layout.main.cx) * t,
      layout.main.cy + (layout.super.cy - layout.main.cy) * t,
    );
    expect(sup.classList.contains('floating')).toBe(true);
    expect(main.classList.contains('floating')).toBe(false);
  });

  it('drag and release fires the aim relative to where the finger landed', () => {
    const { sender, main, fire } = setup();
    const x = layout.main.cx + 30;
    const y = layout.main.cy;
    fire('pointerdown', x, y);
    fire('pointermove', x - 35, y);
    expect(sender.get('flags')).toBe(1);
    expect(main.classList.contains('aiming')).toBe(true);
    fire('pointerup', x - 35, y);
    expect(sender.get('mainFires')).toBe(1);
    expect(sender.get('mainX')).toBe(-50);
    expect(sender.get('mainY')).toBe(0);
    expect(sender.get('flags')).toBe(0);
    expect(main.classList.contains('floating')).toBe(false);
  });

  it('a quick tap fires with aim 0,0', () => {
    const { sender, fire } = setup();
    fire('pointerdown', layout.main.cx, layout.main.cy);
    fire('pointerup', layout.main.cx, layout.main.cy);
    expect(sender.get('mainFires')).toBe(1);
    expect(sender.get('mainX')).toBe(0);
  });

  it('ignores touches for tap-mode attacks, the action button and strays', () => {
    const { sender, main, sup, fire } = setup(['main']);
    fire('pointerdown', layout.super.cx, layout.super.cy);
    expect(sup.classList.contains('floating')).toBe(false);
    fire('pointerdown', layout.action.cx, layout.action.cy);
    fire('pointerdown', layout.main.cx, 0);
    expect(main.classList.contains('floating')).toBe(false);
    expect(sender.get('mainFires')).toBe(0);
  });
});
