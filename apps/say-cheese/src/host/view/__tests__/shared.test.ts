// @vitest-environment jsdom
// TV lobby grouping and pass view for shared phones (SPEC §6.3.1; SC7).
import { describe, expect, it } from 'vitest';
import { noopSfx } from '../../../shared/sfx';
import type { LobbyPlayer } from '../../../shared/messages';
import type { TvView } from '../../match/types';
import { renderTv } from '..';

const P = (id: string, phoneId: string, name: string): LobbyPlayer => ({
  playerId: id as LobbyPlayer['playerId'],
  phoneId,
  name,
  color: 'crimson',
  ready: true,
  camera: 'ok',
  connected: true,
});
const controls = { emit() {}, sfx: noopSfx, origin: 'http://x' };

describe('TV shared phones', () => {
  it('groups shared seats under the first player with a phone marker', () => {
    const root = document.createElement('div');
    const view: TvView = {
      phase: 'lobby',
      code: 'ABCD',
      leaderName: 'Ana',
      canStart: false,
      players: [
        P('a#0', 'a', 'Ana'),
        P('b#0', 'b', 'Bo'),
        P('a#1', 'a', 'Leo'),
        P('a#2', 'a', 'Mia'),
      ],
    };
    renderTv(root, view, controls);
    const group = root.querySelector<HTMLElement>('[data-player="a#0"]')!;
    expect(group.querySelector('.phone-mark')?.textContent).toBe('📱');
    const nested = [...group.querySelectorAll<HTMLElement>('ul.shared > li')];
    expect(nested.map((l) => l.dataset.player)).toEqual(['a#1', 'a#2']);
    expect(root.querySelector('[data-player="b#0"] .phone-mark')).toBeNull();
    expect(root.querySelectorAll('li.player')).toHaveLength(4);
  });

  it('pass view says who gets the phone', () => {
    const root = document.createElement('div');
    renderTv(
      root,
      { phase: 'pass', photographer: { playerId: 'a#1', name: 'Leo', color: 'jade' } },
      controls,
    );
    expect(root.querySelector('.view.pass')?.textContent).toContain('Pass the phone to');
    expect(root.querySelector('.view.pass .chip')?.textContent).toBe('Leo');
  });
});
