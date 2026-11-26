// Core hook group (BUILD_PLAN TF7; SPEC §12.3): room code, lobby roster, spike phase, the round's
// `WorldView`, and the debug-only `?timeScale=` control. `code()` and `players()` keep the scaffold's
// shape (e2e/helpers.ts).
import type { HookGroup } from '../debug';

const core: HookGroup = (rt, register) => {
  register('code', () => rt.code());
  register('players', () => rt.players().map((p) => ({ id: p.id, name: p.name })));
  register('phase', () => rt.phase());
  register('world', () => rt.world());
  register('setTimeScale', (n: number) => rt.setTimeScale(n));
  register('timeScale', () => rt.timeScale);
};

export default core;
