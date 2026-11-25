// TV entry (index.html, SPEC §4, §5): opens a room under game ID `thieves-forum`, boots the Phaser
// canvas (placeholder forum) and shows the title / lobby over it as DOM. Wake Lock, the full-screen
// button and, in dev or with `?debug=1`, `window.__pcg` (room code and roster, for e2e).
// Mode routing (SPEC §12.7, TF0) so parallel milestones never share an entry file: `?gallery=1` →
// gallery/ (TF1), `?spike=tipoff` → spike/ (TF4), `?ui=<screen>` → ui/preview.ts (TF6), else the game.
// Setup shell: no match flow yet (BUILD_PLAN).
import {
  createHostFullscreenButton,
  createHostWakeLock,
  debugEnabled,
  installDebug,
  relayUrl,
} from '@pcg/game-kit';
import { createHostClient } from '@pcg/net-client';
import { GAME_ID, isPhoneMsg, MAX_PLAYERS, type HostMsg } from '../shared/messages';
import { mountVersionTag } from '../shared/version';
import '../styles/brand.css';
import '../styles/tv.css';
import { createLobby } from './lobby';
import { createRoster } from './roster';
import { createForumGame } from './scene/forumScene';

const tv = document.getElementById('tv') ?? document.body;
mountVersionTag();

function bootGame(): void {
  const stage = document.createElement('div');
  stage.className = 'tv-stage';
  tv.append(stage);
  createForumGame(stage);

  const client = createHostClient({
    url: relayUrl(import.meta.env.VITE_RELAY_URL),
    game: GAME_ID,
    maxPlayers: MAX_PLAYERS,
  });
  const roster = createRoster();
  const lobby = createLobby(tv, location.origin);
  const render = () =>
    lobby.update({ code: client.code, names: roster.players().map((p) => p.name) });

  client.onMessage((from, data) => {
    if (!isPhoneMsg(data) || data.t !== 'join') return;
    const name = roster.join(from, data.name);
    if (name === null) return;
    client.send({ t: 'joined', name } satisfies HostMsg, from);
    render();
  });
  client.onPeer((change) => {
    roster.peer(change);
    render();
  });
  client.onRoom(() => render());

  createHostFullscreenButton({ parent: tv });
  void createHostWakeLock().request();
  if (debugEnabled(import.meta.env.DEV)) {
    installDebug({ code: () => client.code, players: () => roster.players() });
  }

  render();
  void client.start().then(render, (e: unknown) => {
    console.error("Thieves' Forum: could not open a room", e);
  });
}

const params = new URLSearchParams(location.search);
const ui = params.get('ui');
if (params.get('gallery') === '1') void import('./gallery/index').then((m) => m.mount(tv));
else if (params.get('spike') === 'tipoff') void import('./spike/index').then((m) => m.mount(tv));
else if (ui) void import('./ui/preview').then((m) => m.mount(tv, ui));
else bootGame();
