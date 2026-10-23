// Maps each host `Screen` kind to a view. Kinds in the same group reuse one view (no DOM churn).
import type { Screen, ScreenKind } from '../../shared/messages';
import type { ScreenCtx, ScreenView } from './common';
import { createController } from './controller';
import { createEliminated } from './eliminated';
import { createLobby } from './lobby';
import { createMatchEnd, createResults } from './results';
import { createGamePaused, createLeft } from './simple';
import { createSpectating } from './spectating';

export type ViewGroup =
  | 'lobby'
  | 'controller'
  | 'eliminated'
  | 'spectating'
  | 'results'
  | 'matchEnd'
  | 'gamePaused'
  | 'left';

export const GROUP_OF: Record<ScreenKind, ViewGroup> = {
  lobby: 'lobby',
  countdown: 'controller',
  playing: 'controller',
  ghost: 'controller',
  eliminated: 'eliminated',
  spectating: 'spectating',
  results: 'results',
  matchEnd: 'matchEnd',
  gamePaused: 'gamePaused',
  left: 'left',
};

export const SCREEN_KINDS = Object.keys(GROUP_OF) as ScreenKind[];

/* eslint-disable @typescript-eslint/no-explicit-any */
export function createView(screen: Screen, ctx: ScreenCtx): ScreenView<any> {
  switch (screen.kind) {
    case 'lobby':
      return createLobby(ctx, screen);
    case 'countdown':
    case 'playing':
    case 'ghost':
      return createController(ctx, screen);
    case 'eliminated':
      return createEliminated(screen);
    case 'spectating':
      return createSpectating(ctx, screen);
    case 'results':
      return createResults(ctx, screen);
    case 'matchEnd':
      return createMatchEnd(ctx, screen);
    case 'gamePaused':
      return createGamePaused(ctx);
    case 'left':
      return createLeft();
  }
}
