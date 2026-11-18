// TV chrome that lives outside the repainted `#tv` root (SPEC §6.6, PLATFORM §3; controller-compat F5):
// the full-screen button (lobby, rules and match-end screens, hidden during play, plus the `F` key) and a
// small "Reconnecting…" pill for the TV's own relay socket. Full screen starts only from a click or key
// press here: gamepad and phone messages can't grant the browser's user activation.
import { createHostFullscreenButton } from '@pcg/game-kit';
import type { ConnectionStatus } from '@pcg/net-client';
import type { Phase } from './match';
import { h } from './view/dom';

/** Views where the TV is waiting on people, so a button is welcome (never over the photos or timers). */
const MENU_PHASES: readonly Phase[] = ['lobby', 'rules', 'matchEnd'];

export interface HostChrome {
  /** Call on every TV view change. */
  setPhase(phase: Phase): void;
  setStatus(status: ConnectionStatus): void;
  destroy(): void;
}

export function mountHostChrome(parent: HTMLElement = document.body): HostChrome {
  const bar = h('div', 'host-chrome');
  parent.append(bar);
  const fullscreen = createHostFullscreenButton({
    parent: bar,
    className: 'pcg-fullscreen-btn btn',
  });
  fullscreen.element.dataset.action = 'fullscreen';
  fullscreen.setVisible(false);

  const pill = h('div', 'host-conn', 'Reconnecting…');
  pill.setAttribute('role', 'status');
  pill.hidden = true;
  parent.append(pill);

  return {
    setPhase: (phase) => fullscreen.setVisible(MENU_PHASES.includes(phase)),
    setStatus: (status) => {
      pill.hidden = status !== 'reconnecting';
    },
    destroy() {
      fullscreen.destroy();
      bar.remove();
      pill.remove();
    },
  };
}
