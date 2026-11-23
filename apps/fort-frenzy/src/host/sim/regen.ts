// Holding off delayed regen (SPEC §5, RC1 #120): firing a main or a super restarts the wait, on every
// path that fires one (`fire` in players.ts, each nanite of a blast in classes/artificer.ts).
import type { SimState } from './internal';
import type { PlayerEnt } from './types';

export function holdRegen(s: Pick<SimState, 'world' | 'cat'>, p: PlayerEnt): void {
  p.regen.quietUntil = s.world.tick + s.cat.steps(s.cat.rules.regen.delayMs);
  p.regen.nextRegen = p.regen.quietUntil;
}
