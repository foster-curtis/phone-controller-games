// TV entry (index.html, SPEC §4, §6.6). `?gallery=1` cycles every TV view offline; otherwise the
// placeholder lobby until host wiring (SC5) feeds real `TvView`s into `renderTv`.
import { debugEnabled, installDebug } from '@pcg/game-kit';
import { noopSfx } from '../shared/sfx';
import { mountVersionTag } from '../shared/version';
import '../styles/brand.css';
import '../styles/base.css';
import '../styles/tv.css';
import { mountGallery } from './gallery';
import type { TvView } from './match/types';
import { renderTv } from './view';

const tv = document.getElementById('tv') ?? document.body;
const params = new URLSearchParams(location.search);
mountVersionTag();

if (params.get('gallery') === '1') {
  mountGallery(tv);
} else {
  const lobby: TvView = {
    phase: 'lobby',
    code: null,
    leaderName: null,
    players: [],
    canStart: false,
  };
  renderTv(tv, lobby, { emit: () => {}, sfx: noopSfx, origin: location.origin });
}

if (debugEnabled(import.meta.env.DEV)) {
  // SC5 fills this in (match state, timeScale, forced screens).
  installDebug({ ready: true });
}
