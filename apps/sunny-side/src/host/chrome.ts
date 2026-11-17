// Host (TV) page chrome outside the Phaser canvas: the full-screen button (lobby and between-round
// menus only, never over the play area) and a small "Reconnecting…" pill for the TV's own relay
// socket. Full screen starts only from a click or the `F` key on this page (PLATFORM §3).
import type { ConnectionStatus } from '@pcg/net-client';
import { createHostFullscreenButton } from '@pcg/game-kit';
import type { MatchPhase } from './match';

/** Phases that are menus (lobby, between rounds, final standings); play and its intro stay clear. */
const MENU_PHASES: readonly MatchPhase[] = ['lobby', 'results', 'matchEnd'];

/** Whether the full-screen button shows: on a menu phase, or while the game is paused. */
export function fullscreenButtonVisible(phase: MatchPhase, paused: boolean): boolean {
  return paused || MENU_PHASES.includes(phase);
}

export const HOST_RECONNECTING_TEXT = 'Reconnecting…';

export interface HostChrome {
  update(phase: MatchPhase, paused: boolean, status: ConnectionStatus): void;
  destroy(): void;
}

export function mountHostChrome(parent: HTMLElement = document.body): HostChrome {
  const fullscreen = createHostFullscreenButton({
    parent,
    className: 'pcg-fullscreen-btn host-fullscreen-btn',
  });
  const pill = document.createElement('div');
  pill.className = 'host-status';
  pill.setAttribute('role', 'status');
  pill.dataset.hostStatus = '';
  pill.textContent = HOST_RECONNECTING_TEXT;
  pill.hidden = true;
  parent.append(pill);
  return {
    update(phase, paused, status) {
      fullscreen.setVisible(fullscreenButtonVisible(phase, paused));
      pill.hidden = status !== 'reconnecting';
    },
    destroy() {
      fullscreen.destroy();
      pill.remove();
    },
  };
}
