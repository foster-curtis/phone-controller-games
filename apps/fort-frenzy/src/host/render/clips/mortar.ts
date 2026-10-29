// Mortar tower clips (SPEC §7.2). A structure doesn't walk: `idle` only (the tube is aimed by code,
// render/structures.ts). The fire recoil arrives with FF8.
import type { Clip } from '../../../themes/types';
import { loop } from '../clipKit';

export const clips: Record<string, Clip> = {
  idle: loop(1000, {}),
};
