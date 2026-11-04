// TV entry (index.html, SPEC §4, §6.6, §8). `?gallery=1` cycles every TV view offline; otherwise the
// relay host client drives the match (game.ts), with Wake Lock, the tab-hidden timer pause, host keys
// and, in dev or with `?debug=1`, `window.__pcg`.
import {
  createHostWakeLock,
  debugEnabled,
  installDebug,
  relayUrl,
  watchVisibility,
} from '@pcg/game-kit';
import { createHostClient } from '@pcg/net-client';
import { GAME_ID, MAX_PHONES } from '../shared/messages';
import '../styles/brand.css';
import '../styles/base.css';
import '../styles/tv.css';
import { installHostKeys } from './controls';
import { applyTimeScaleParam, createHostDebug } from './debug';
import { createHostGame } from './game';
import { mountGallery } from './gallery';
import { createHostSfx } from './sfx';
import { createHostTimers } from './timers';

const tv = document.getElementById('tv') ?? document.body;
const params = new URLSearchParams(location.search);

function boot(): void {
  const debug = debugEnabled(import.meta.env.DEV);
  if (debug) applyTimeScaleParam(location.search);

  const client = createHostClient({
    url: relayUrl(import.meta.env.VITE_RELAY_URL),
    game: GAME_ID,
    maxPlayers: MAX_PHONES,
  });
  const game = createHostGame({
    client,
    root: tv,
    origin: location.origin,
    timers: createHostTimers(),
    sfx: createHostSfx(),
  });
  installHostKeys(document, () => game.tv(), game.control);
  watchVisibility((visible) => game.setVisible(visible));
  void createHostWakeLock().request();
  if (debug) installDebug(createHostDebug(game, client));

  void client.start().catch((e: unknown) => {
    console.error('Say Cheese: could not open a room', e);
  });
}

if (params.get('gallery') === '1') mountGallery(tv);
else boot();
