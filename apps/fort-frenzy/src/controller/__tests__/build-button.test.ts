// The combat build button (SPEC §10.1): inert while `me.build` is null or mode 'none'; a tap while
// enabled bumps `buildFires` (tuple[11]) with build aim 0,0. No aimed build gesture yet.
import { describe, expect, it } from 'vitest';
import { createPhoneSender } from '../input';
import { bindBuild, buildEnabled } from '../screens/combat';
import { sampleMe } from '../samples';

const build = (mode: 'place' | 'recall' | 'none') =>
  sampleMe().build && { ...sampleMe().build!, mode };

function tap(btn: HTMLElement) {
  const fire = (type: string) => {
    const e = new MouseEvent(type, { clientX: 5, clientY: 5, bubbles: true, cancelable: true });
    Object.defineProperty(e, 'pointerId', { value: 1 });
    btn.dispatchEvent(e);
  };
  fire('pointerdown');
  fire('pointerup');
}

describe('build button', () => {
  it('is enabled only with a build whose mode is place or recall', () => {
    expect(buildEnabled(null)).toBe(false);
    expect(buildEnabled(build('none'))).toBe(false);
    expect(buildEnabled(build('place'))).toBe(true);
    expect(buildEnabled(build('recall'))).toBe(true);
  });

  it('a tap bumps buildFires only while enabled, with aim 0,0 and no aiming flag', () => {
    const sender = createPhoneSender(() => {});
    const btn = document.createElement('div');
    document.body.append(btn);
    let on = false;
    bindBuild(btn, sender, () => on);
    tap(btn);
    expect(sender.tuple()[11]).toBe(0);
    on = true;
    tap(btn);
    const t = sender.tuple();
    expect([t[6], t[7], t[8], t[11]]).toEqual([0, 0, 0, 1]);
  });
});
