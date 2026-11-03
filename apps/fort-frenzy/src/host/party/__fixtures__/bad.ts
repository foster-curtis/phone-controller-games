// Lint fixture (BUILD_PLAN FF1): breaks every src/host/party boundary on purpose (SPEC §15.1).
// Ignored by the normal lint run; `pnpm exec eslint --no-ignore <this file>` must fail, and
// src/host/__tests__/boundaries.test.ts asserts each rule fires. Never import this file.
import type { CardDef } from '../../../content/types';
import type { RunStart } from '../../sim/types';
import type { TeamView } from '../../../shared/messages';
import { createHostClient } from '@pcg/net-client';

export type Data = [CardDef, RunStart, TeamView]; // no content, no sim, no other app folders
export const client = createHostClient; // no net-client
export const key = localStorage.getItem('k'); // no DOM
