// Host debug hooks (SPEC §8; AGENTS.md "Debug hooks"): `window.__pcg`, on in dev or with `?debug=1`.
// e2e reads the room code, phase, state and TV view, presses host controls and changes `timeScale`
// (BUILD_PLAN §8: e2e runs the scatter / shoot / upload timers at `?timeScale=0.1`).
import type { HostClient } from '@pcg/net-client';
import type { HostGame } from './game';
import { setTimeScale, timeScale } from './match/config';
import type { HostControl, MatchState, Phase, TvView } from './match';
import type { SeatId } from '../shared/seats/types';

export interface HostDebug {
  code(): string | null;
  phase(): Phase;
  /** A JSON copy of the match state. */
  state(): MatchState;
  tv(): TvView;
  control(c: HostControl): void;
  start(): void;
  next(): void;
  skip(): void;
  skipReview(): void;
  rematch(): void;
  lobby(): void;
  remove(playerId: SeatId): void;
  /** Applies to timers started from now on (0 < n ≤ 1). */
  setTimeScale(n: number): void;
  timeScale(): number;
}

export function createHostDebug(game: HostGame, client: Pick<HostClient, 'code'>): HostDebug {
  const c = (action: Exclude<HostControl['action'], 'remove'>) => () => game.control({ action });
  return {
    code: () => client.code,
    phase: () => game.match.state.phase,
    state: () => JSON.parse(JSON.stringify(game.match.state)) as MatchState,
    tv: () => game.tv(),
    control: (ctl) => game.control(ctl),
    start: c('start'),
    next: c('next'),
    skip: c('skip'),
    skipReview: c('skipReview'),
    rematch: c('rematch'),
    lobby: c('lobby'),
    remove: (playerId) => game.control({ action: 'remove', playerId }),
    setTimeScale,
    timeScale: () => timeScale,
  };
}

/** `?timeScale=` (debug only); junk is ignored by `setTimeScale`. */
export function applyTimeScaleParam(search: string): void {
  const v = new URLSearchParams(search).get('timeScale');
  if (v !== null) setTimeScale(Number(v));
}
