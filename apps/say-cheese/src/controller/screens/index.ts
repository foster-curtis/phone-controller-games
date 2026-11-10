// Screen factory (SPEC §6.7): one routed view per `Screen.kind`.
import type { Screen } from '../../shared/messages';
import type { Ctx } from '../ctx';
import { reviewView } from '../review/reviewView';
import { joiningView, lobbyView } from './lobby';
import { announceView, scatterView, shootView } from './round';
import { matchEndView, resultsView } from './results';
import { passView } from './pass';
import { leftView, rulesView, spectatingView, uploadView } from './simple';
import type { View } from './view';

export function createView(screen: Screen, ctx: Ctx): View {
  switch (screen.kind) {
    case 'joining':
      return joiningView(screen, ctx);
    case 'lobby':
      return lobbyView(screen, ctx);
    case 'rules':
      return rulesView(screen, ctx);
    case 'pass':
      return passView(screen, ctx);
    case 'announce':
      return announceView(screen, ctx);
    case 'scatter':
      return scatterView(screen, ctx);
    case 'shoot':
      return shootView(screen, ctx);
    case 'upload':
      return uploadView(screen);
    case 'review':
      return reviewView(screen, ctx);
    case 'results':
      return resultsView(screen, ctx);
    case 'matchEnd':
      return matchEndView(screen, ctx);
    case 'spectating':
      return spectatingView(screen);
    case 'left':
      return leftView(screen);
  }
}

/** Screens of the same kind update in place; a new kind remounts. Joining and lobby share one view. */
export const groupOf = (s: Screen): string => (s.kind === 'joining' ? 'lobby' : s.kind);
