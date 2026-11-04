// FF7-fix-3 (C3 follow-up, SPEC §10.1, §15.7): the Warden's slam and the Commander's slash are aimed
// buttons on the combat screen. Tuple encoding of each gesture outcome through the real screen: a
// quick tap fires with aim 0,0 (auto-aim), a drag sets the aiming flag and fires its aim on release,
// a return to the dead zone (or a hold past 150 ms that never left it) cancels.
import { createLocalClient } from '@pcg/controller-kit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { characters } from '../../content/characters';
import { createApp, type App } from '../app';
import { CLASS_INFO } from '../copy';
import { layoutCombat } from '../layout';
import { SAMPLES } from '../samples';

let app: App | null = null;
let root: HTMLElement;
let t = 1_000_000;

beforeEach(() => {
  vi.spyOn(Date, 'now').mockImplementation(() => t);
  document.body.innerHTML = '<div id="app"></div>';
  root = document.getElementById('app')!;
});
afterEach(() => {
  app?.destroy();
  app = null;
  vi.restoreAllMocks();
});

function combat(sample: 'combat-warden' | 'combat-commander') {
  const client = createLocalClient();
  const mem = new Map<string, string>();
  const store = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
  };
  app = createApp({
    root,
    client,
    code: 'DEV1',
    storage: store,
    session: store,
    watchOrientation: false,
  });
  const s = SAMPLES[sample]!();
  client.emit({ t: 'team', rev: 1, team: s.team });
  client.emit({ t: 'me', rev: 1, me: s.me });
  const zone = root.querySelector<HTMLElement>('.attack-zone')!;
  const layout = layoutCombat({ width: innerWidth, height: innerHeight });
  const fire = (type: string, x: number, y: number) => {
    const e = new MouseEvent(type, { clientX: x, clientY: y, bubbles: true, cancelable: true });
    Object.defineProperty(e, 'pointerId', { value: 1 });
    zone.dispatchEvent(e);
  };
  return { sender: app.sender, layout, fire, main: root.querySelector('.round-btn.main')! };
}

describe('class copy follows the content input kinds', () => {
  it('every main and super is aimed on the phone exactly when the sim calls it aimed', () => {
    for (const c of characters)
      for (const k of ['main', 'super'] as const)
        expect(CLASS_INFO[c.id][k].mode, `${c.id} ${k}`).toBe(
          c.input[k] === 'aimed' ? 'aim' : 'tap',
        );
    expect(CLASS_INFO.warden.main.mode).toBe('aim');
    expect(CLASS_INFO.commander.main.mode).toBe('aim');
  });
});

for (const sample of ['combat-warden', 'combat-commander'] as const) {
  describe(`${sample}: the main is an aimed button`, () => {
    it('draws as an aimed joystick', () => {
      const { main } = combat(sample);
      expect(main.classList.contains('aim')).toBe(true);
    });

    it('a quick tap in the dead zone fires at once with aim 0,0 (auto-aim)', () => {
      const { sender, layout, fire } = combat(sample);
      fire('pointerdown', layout.main.cx, layout.main.cy);
      t += 80;
      fire('pointerup', layout.main.cx + 2, layout.main.cy);
      expect(sender.get('mainFires')).toBe(1);
      expect(sender.get('mainX')).toBe(0);
      expect(sender.get('mainY')).toBe(0);
      expect(sender.get('flags') & 1).toBe(0);
    });

    it('a drag sets the aiming flag (TV preview) and the release fires its aim', () => {
      const { sender, layout, fire } = combat(sample);
      const { cx, cy } = layout.main;
      fire('pointerdown', cx, cy);
      t += 60;
      fire('pointermove', cx, cy + 35);
      expect(sender.get('flags') & 1).toBe(1);
      expect(sender.get('mainX')).toBe(0);
      expect(sender.get('mainY')).toBe(50);
      expect(sender.get('mainFires')).toBe(0);
      t += 400;
      // Clamped to 70 px: a long drag is full aim.
      fire('pointerup', cx - 200, cy);
      expect(sender.get('mainFires')).toBe(1);
      expect(sender.get('mainX')).toBe(-100);
      expect(sender.get('mainY')).toBe(0);
      expect(sender.get('flags') & 1).toBe(0);
    });

    it('sliding back into the dead zone and releasing cancels', () => {
      const { sender, layout, fire } = combat(sample);
      const { cx, cy } = layout.main;
      fire('pointerdown', cx, cy);
      fire('pointermove', cx + 40, cy);
      expect(sender.get('flags') & 1).toBe(1);
      fire('pointermove', cx + 3, cy);
      t += 300;
      fire('pointerup', cx + 3, cy);
      expect(sender.get('mainFires')).toBe(0);
      expect(sender.get('flags') & 1).toBe(0);
    });

    it('a hold past 150 ms that never leaves the dead zone is not a tap (cancels)', () => {
      const { sender, layout, fire } = combat(sample);
      fire('pointerdown', layout.main.cx, layout.main.cy);
      t += 200;
      fire('pointerup', layout.main.cx, layout.main.cy);
      expect(sender.get('mainFires')).toBe(0);
    });
  });
}
