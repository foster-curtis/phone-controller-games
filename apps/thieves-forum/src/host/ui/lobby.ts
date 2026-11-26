// Scaffold-compatible title / lobby (SPEC §6.16, §6.18): `createLobby(parent, origin).update({code,
// names})` kept for host/main.ts until the match wiring drives `createTvUi` with real `TvView`s.
// Players show with placeholder colors (the roster has none yet) and nobody is ready.
import { joinUrl } from '@pcg/game-kit';
import { PLAYER_COLOR_IDS } from '../../shared/theme';
import { createTvUi, type TvUi } from './tvUi';

export interface LobbyView {
  code: string | null;
  names: string[];
}

export interface Lobby {
  readonly root: HTMLElement;
  readonly ui: TvUi;
  update(view: LobbyView): void;
}

export function createLobby(parent: HTMLElement, origin: string): Lobby {
  const ui = createTvUi(parent);
  return {
    root: ui.root,
    ui,
    update(view) {
      ui.render({
        phase: 'lobby',
        code: view.code,
        joinUrl: view.code ? joinUrl(origin, view.code) : null,
        players: view.names.map((name, i) => ({
          name,
          color: PLAYER_COLOR_IDS[i % PLAYER_COLOR_IDS.length]!,
          ready: false,
          leader: i === 0,
        })),
        canStart: false,
      });
    },
  };
}
