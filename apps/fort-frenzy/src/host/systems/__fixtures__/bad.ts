// Lint fixture (BUILD_PLAN FF1): breaks every src/host/systems boundary on purpose (SPEC §15.1).
// Ignored by the normal lint run; `pnpm exec eslint --no-ignore <this file>` must fail, and
// src/host/__tests__/boundaries.test.ts asserts each rule fires. Never import this file.
import type { WaveDef } from '../../../content/types';
import type { World } from '../../sim/types';
import type { ClassId } from '../../../shared/ids';

export type Data = [WaveDef, World, ClassId]; // no content, no sim, no other app folders
export const t = window.innerWidth; // no DOM
export const r = Math.random(); // determinism
