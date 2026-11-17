import { describe, expect, it } from 'vitest';
import {
  clampRulesCard,
  isLastRulesCard,
  isRulesAction,
  openRulesOverview,
  resolveRulesCard,
  rulesNextLabel,
  stepRulesOverview,
  type RulesCard,
  type RulesOverviewState,
} from '../src/index';

const noArt = { mount: () => ({ destroy() {} }) };

describe('rules overview sequencer', () => {
  it('opens on the first card and remembers the source', () => {
    expect(openRulesOverview('firstStart', 5)).toEqual({ source: 'firstStart', card: 0, cards: 5 });
    expect(openRulesOverview('lobby', 1)).toEqual({ source: 'lobby', card: 0, cards: 1 });
    expect(() => openRulesOverview('lobby', 0)).toThrow();
    expect(() => openRulesOverview('lobby', 2.5)).toThrow();
  });

  it('Next walks every card, then finishes (not skipped)', () => {
    let s: RulesOverviewState = openRulesOverview('firstStart', 3);
    const seen = [s.card];
    for (;;) {
      const r = stepRulesOverview(s, 'next');
      if (r.done) {
        expect(r).toEqual({ done: true, source: 'firstStart', skipped: false });
        break;
      }
      s = r.state;
      seen.push(s.card);
    }
    expect(seen).toEqual([0, 1, 2]);
  });

  it('Skip finishes from any card and keeps the source', () => {
    for (const card of [0, 1, 4]) {
      const r = stepRulesOverview({ source: 'lobby', card, cards: 5 }, 'skip');
      expect(r).toEqual({ done: true, source: 'lobby', skipped: true });
    }
  });

  it('does not mutate the state it is given', () => {
    const s = Object.freeze(openRulesOverview('lobby', 3));
    const r = stepRulesOverview(s, 'next');
    expect(s.card).toBe(0);
    expect(r.done ? null : r.state.card).toBe(1);
  });

  it('labels: Next, then "Let\'s play!" on the last card', () => {
    expect(rulesNextLabel({ card: 0, cards: 5 })).toBe('Next');
    expect(rulesNextLabel({ card: 4, cards: 5 })).toBe("Let's play!");
    expect(isLastRulesCard({ card: 3, cards: 5 })).toBe(false);
    expect(isLastRulesCard({ card: 0, cards: 1 })).toBe(true);
  });

  it('clamps stale indexes and validates actions', () => {
    expect(clampRulesCard(-2, 5)).toBe(0);
    expect(clampRulesCard(9, 5)).toBe(4);
    expect(clampRulesCard(Number.NaN, 5)).toBe(0);
    expect(clampRulesCard(3, 0)).toBe(0);
    expect(isRulesAction('next')).toBe(true);
    expect(isRulesAction('skip')).toBe(true);
    expect(isRulesAction('start')).toBe(false);
    expect(isRulesAction(undefined)).toBe(false);
  });

  it('resolves fixed and live text', () => {
    const card: RulesCard = {
      title: 'Scoring',
      body: ({ playerCount }) => `First to ${playerCount * 2} wins.`,
      note: 'Small print.',
      illustration: noArt,
    };
    expect(resolveRulesCard(card, { playerCount: 3 })).toEqual({
      title: 'Scoring',
      body: 'First to 6 wins.',
      note: 'Small print.',
    });
    expect(resolveRulesCard({ ...card, note: undefined }, { playerCount: 1 }).note).toBeNull();
  });
});
