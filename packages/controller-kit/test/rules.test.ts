import { describe, expect, it } from 'vitest';
import { rulesPhoneModel } from '../src/index';

describe('rules phone model', () => {
  it('everyone: heading, card caption, Watch the TV', () => {
    const m = rulesPhoneModel({ card: 1, cards: 6, isLeader: false });
    expect(m.heading).toBe('How to play');
    expect(m.caption).toBe('Card 2 of 6');
    expect(m.watch).toBe('Watch the TV');
    expect(m.next).toBeNull();
    expect(m.skip).toBeNull();
  });

  it('leader: Next and Skip, then only "Let\'s play!" on the last card', () => {
    const mid = rulesPhoneModel({ card: 0, cards: 6, isLeader: true });
    expect(mid.next).toEqual({ label: 'Next', action: 'next', id: 'next', quiet: false });
    expect(mid.skip).toEqual({ label: 'Skip', action: 'skip', id: 'skip', quiet: true });
    const last = rulesPhoneModel({ card: 5, cards: 6, isLeader: true });
    expect(last.next?.label).toBe("Let's play!");
    expect(last.skip).toBeNull();
  });

  it('clamps a stale card index', () => {
    expect(rulesPhoneModel({ card: 9, cards: 3, isLeader: true }).caption).toBe('Card 3 of 3');
    expect(rulesPhoneModel({ card: -1, cards: 3, isLeader: false }).caption).toBe('Card 1 of 3');
  });
});
