// Screen registry: which view each `me.screen` mounts and which screens share a view (SPEC §15.7:
// combat + dead; lobby + class select; build with its Build and Shop tabs).
import type { MeScreen } from '../../shared/messages';
import { createBuild } from './build';
import { createCombat } from './combat';
import type { ScreenCtx, Snapshot, View } from './common';
import { createLobby } from './lobby';
import { createClaim, createName, createStatus } from './simple';
import { createSummary } from './summary';

export type ViewGroup = 'name' | 'lobby' | 'status' | 'claim' | 'combat' | 'build' | 'summary';

export const GROUP_OF: Record<MeScreen, ViewGroup> = {
  name: 'name',
  lobby: 'lobby',
  waiting: 'status',
  full: 'status',
  restoring: 'status',
  claim: 'claim',
  combat: 'combat',
  dead: 'combat',
  build: 'build',
  summary: 'summary',
};

/** Screens where the phone streams input tuples (movement and combat). */
export const INPUT_GROUPS: readonly ViewGroup[] = ['combat', 'build'];

export function createView(s: Snapshot, ctx: ScreenCtx): View {
  let view: View;
  switch (GROUP_OF[s.me.screen]) {
    case 'name':
      view = createName(ctx, s);
      break;
    case 'lobby':
      view = createLobby(ctx);
      break;
    case 'status':
      view = createStatus(s.me.screen);
      break;
    case 'claim':
      view = createClaim(ctx);
      break;
    case 'combat':
      view = createCombat(ctx);
      break;
    case 'build':
      view = createBuild(ctx);
      break;
    case 'summary':
      view = createSummary(ctx);
      break;
  }
  view.update(s);
  return view;
}
