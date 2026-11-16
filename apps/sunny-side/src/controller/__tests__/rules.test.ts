// How to play phone screen (SPEC §6.9, §6.7): Sunny Side's builders around the kit's rules screen.
import { describe, expect, it } from 'vitest';
import { mount, sampleScreen } from './helpers';

const q = (root: ParentNode, sel: string) => root.querySelector<HTMLElement>(sel);

describe('rules screen', () => {
  it('leader: card caption, Watch the TV, Next and Skip send leader actions', () => {
    const h = mount();
    h.show(sampleScreen('rules'));
    const root = q(h.root, '[data-screen=rules]')!;
    expect(root.textContent).toContain('How to play');
    expect(root.textContent).toContain('Card 2 of 6');
    expect(root.textContent).toContain('Watch the TV');
    q(root, '[data-leader=next]')!.click();
    q(root, '[data-leader=skip]')!.click();
    expect(h.msgs()).toEqual(
      expect.arrayContaining([
        { t: 'leader', action: 'next' },
        { t: 'leader', action: 'skip' },
      ]),
    );
  });

  it("leader on the last card: Let's play!, no Skip", () => {
    const h = mount();
    h.show({ ...sampleScreen('rules'), card: 5, cards: 6 } as never);
    const root = q(h.root, '[data-screen=rules]')!;
    expect(q(root, '[data-leader=next]')?.textContent).toBe("Let's play!");
    expect(q(root, '[data-leader=skip]')).toBeNull();
  });

  it('non-leader: no buttons, just Watch the TV; updates in place when the card changes', () => {
    const h = mount();
    const screen = { ...sampleScreen('rules'), isLeader: false } as never;
    h.show(screen);
    const root = q(h.root, '[data-screen=rules]')!;
    expect(root.querySelectorAll('button').length).toBe(0);
    expect(root.textContent).toContain('Watch the TV');
    h.show({ ...(screen as object), card: 3 } as never);
    expect(q(h.root, '[data-screen=rules]')).toBe(root);
    expect(root.textContent).toContain('Card 4 of 6');
  });

  it('a leader handoff gives the new leader the buttons', () => {
    const h = mount();
    h.show({ ...sampleScreen('rules'), isLeader: false } as never);
    expect(q(h.root, '[data-leader]')).toBeNull();
    h.show({ ...sampleScreen('rules'), isLeader: true } as never);
    expect(q(h.root, '[data-leader=next]')).not.toBeNull();
  });
});
