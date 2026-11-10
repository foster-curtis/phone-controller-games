// Offline TV gallery (`/?gallery=1`, SPEC §6.6, BUILD_PLAN SC4): cycles every phase with fixture
// `TvView`s (8 players, 15 photos with many tags, ties) and generated SVG placeholder photos. No net.
import { PLAYER_COLOR_IDS, type PlayerSummary, type Standing } from '../shared/messages';
import { noopSfx } from '../shared/sfx';
import { installHostKeys } from './controls';
import { MAX_SHOTS } from './match/config';
import type { TvView } from './match/types';
import { renderTv } from './view';

const NAMES = ['Ana', 'Ben', 'Cleo', 'Dev', 'Eli', 'Fay', 'Gus', 'Hana'];

export const FIXTURE_PLAYERS: PlayerSummary[] = NAMES.map((name, i) => ({
  playerId: `p${i}#0`,
  name,
  color: PLAYER_COLOR_IDS[i]!,
}));

/** A generated placeholder "photo" (SVG data URL): gradient + shapes, so tags have something under them. */
export function placeholderPhoto(index: number, aspect: number): string {
  const w = 800;
  const hgt = Math.round(w / aspect);
  const hue = (index * 47) % 360;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${hgt}" viewBox="0 0 ${w} ${hgt}">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue} 45% 35%)"/>` +
    `<stop offset="1" stop-color="hsl(${(hue + 60) % 360} 40% 20%)"/></linearGradient></defs>` +
    `<rect width="${w}" height="${hgt}" fill="url(#g)"/>` +
    `<circle cx="${w * 0.3}" cy="${hgt * 0.55}" r="${hgt * 0.12}" fill="#fff" opacity=".25"/>` +
    `<circle cx="${w * 0.7}" cy="${hgt * 0.4}" r="${hgt * 0.1}" fill="#fff" opacity=".2"/>` +
    `<text x="${w / 2}" y="${hgt / 2}" fill="#fff" opacity=".4" font-size="64" text-anchor="middle">${index + 1}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const standings = (scores: number[], left = -1): Standing[] =>
  FIXTURE_PLAYERS.map((p, i) => ({
    ...p,
    score: scores[i] ?? 0,
    connected: i !== 5,
    left: i === left,
  }));

/** Ties on purpose: 0,0 | 2,2,2 | 3 | 5 | 7. */
const TIED = [2, 0, 3, 2, 0, 2, 5, 7];

export function galleryViews(): TvView[] {
  const [a, b, c, d, e, f, g] = FIXTURE_PLAYERS as PlayerSummary[] as [
    PlayerSummary,
    PlayerSummary,
    PlayerSummary,
    PlayerSummary,
    PlayerSummary,
    PlayerSummary,
    PlayerSummary,
  ];
  const photographer = a;
  const tags = FIXTURE_PLAYERS.slice(1).map((p, i) => ({
    tagId: `t${i}`,
    photo: 3,
    x: 0.08 + ((i * 0.13) % 0.86),
    y: 0.15 + ((i * 0.29) % 0.7),
    playerId: i === 5 ? null : p.playerId,
    player: i === 5 ? null : p,
  }));
  const caught = FIXTURE_PLAYERS.slice(1).map((p, i) => ({ ...p, count: i % 4 }));
  const roster = (who: PlayerSummary) =>
    FIXTURE_PLAYERS.filter((p) => p.playerId !== who.playerId).map((p, i) => ({
      ...p,
      count: i % 4,
    }));
  return [
    {
      phase: 'lobby',
      code: 'KQXT',
      leaderName: 'Ana',
      canStart: true,
      players: FIXTURE_PLAYERS.map((p, i) => ({
        ...p,
        phoneId: `ph${i}`,
        ready: i !== 3,
        camera: i === 2 ? 'denied' : 'ok',
        connected: i !== 6,
      })),
    },
    { phase: 'rules', card: 0, cards: 5 },
    { phase: 'rules', card: 2, cards: 5 },
    { phase: 'rules', card: 4, cards: 5 },
    { phase: 'pass', photographer: b },
    { phase: 'announce', photographer: c, turn: 3, turns: 8 },
    { phase: 'scatter', photographer: d, endsInMs: 7_200 },
    { phase: 'shoot', photographer: e, endsInMs: 12_400, shots: 7, maxShots: MAX_SHOTS },
    { phase: 'upload', photographer: f, received: 13, expected: MAX_SHOTS },
    {
      phase: 'review',
      photographer,
      photo: { index: 3, aspect: 4 / 3, url: placeholderPhoto(3, 4 / 3) },
      photoIndex: 3,
      photoCount: 15,
      tags,
      caught,
      roster: roster(photographer),
      canSkipReview: false,
    },
    {
      phase: 'review',
      photographer: g,
      photo: { index: 8, aspect: 3 / 4, url: placeholderPhoto(8, 3 / 4) },
      photoIndex: 8,
      photoCount: 15,
      tags: tags.slice(0, 3),
      caught,
      roster: roster(g),
      canSkipReview: true,
    },
    {
      phase: 'results',
      photographer,
      caught,
      photographerDelta: -11,
      standings: standings(TIED, 3),
      last: false,
    },
    {
      phase: 'matchEnd',
      standings: standings(TIED),
      winners: [FIXTURE_PLAYERS[1]!.playerId, FIXTURE_PLAYERS[4]!.playerId],
    },
  ];
}

/** Mounts the gallery: auto-cycles every few seconds; any host key or button advances; `?phase=` pins. */
export function mountGallery(root: HTMLElement, search = location.search): void {
  const views = galleryViews();
  const q = new URLSearchParams(search);
  const pin = q.get('phase');
  let i = Math.max(
    0,
    views.findIndex((v) => v.phase === pin),
  );
  const show = () =>
    renderTv(root, views[i]!, { emit: step, sfx: noopSfx, origin: location.origin });
  function step() {
    i = (i + 1) % views.length;
    show();
  }
  show();
  installHostKeys(document, () => views[i]!, step);
  if (!pin) setInterval(step, 4000);
}
