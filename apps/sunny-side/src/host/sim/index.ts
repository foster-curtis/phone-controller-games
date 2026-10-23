// Public entry for the headless sim. M6 imports `createSim` from here (or from ./types).
import { SimWorld } from './world';
import type { Sim, SimOptions } from './types';

export type * from './types';
export { SIM_CONFIG, STEP_MS } from './config';

export function createSim(opts: SimOptions = {}): Sim {
  return new SimWorld(opts);
}
