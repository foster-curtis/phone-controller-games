import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, sampleScreen } from './helpers';
import type { Screen } from '../../shared/messages';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const show = (kind: 'lobby' | 'results' | 'matchEnd', isLeader: boolean) => {
  const h = mount();
  h.show({ ...sampleScreen(kind), isLeader, leaderName: 'Ann' } as Screen);
  return h.root.querySelector(`[data-screen="${kind}"]`) as HTMLElement;
};

describe('M5-fix-8: Waiting-for line sits at the end of the scroll content', () => {
  it.each(['results', 'matchEnd'] as const)('%s: last child of .scroll-y, not in .actions', (k) => {
    const scr = show(k, false);
    const line = scr.querySelector('[data-waiting]') as HTMLElement;
    expect(line.textContent).toBe('Waiting for Ann…');
    expect(scr.querySelector('.scroll-y')!.lastElementChild).toBe(line);
    expect(scr.querySelector('.actions [data-waiting]')).toBeNull();
  });

  // The lobby's Ready button reads "Waiting for {leader}…" once ready (see app.test.ts).
  it('lobby: no separate line for non-leaders', () => {
    expect(show('lobby', false).querySelector('[data-waiting]')).toBeNull();
  });

  it.each(['lobby', 'results', 'matchEnd'] as const)('%s: absent for leaders', (k) => {
    expect(show(k, true).querySelector('[data-waiting]')).toBeNull();
  });
});
