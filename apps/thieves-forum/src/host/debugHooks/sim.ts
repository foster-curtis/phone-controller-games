// Sim hook group (BUILD_PLAN TF7; SPEC §12.3 `DebugView`): the dev overlay's view (controllers, NPC
// states, live / planned NPCs), a phone's character id and the host's step-time readout. Debug only:
// these name players, so nothing outside `?debug=1` may reach them (SPEC §6.11).
import type { HookGroup } from '../debug';

const sim: HookGroup = (rt, register) => {
  register('debug', () => rt.debugView());
  register('characterOf', (playerId: string) => rt.characterOf(playerId));
  register('stepStats', () => rt.stepStats());
};

export default sim;
