// Lint fixture (BUILD_PLAN FF1): breaks every src/host/sim boundary on purpose (SPEC §15.1). Ignored by
// the normal lint run (`__fixtures__` in eslint.config.js); check it with
// `pnpm exec eslint --no-ignore apps/fort-frenzy/src/host/sim/__fixtures__/bad.ts`, which must fail.
// src/host/__tests__/boundaries.test.ts asserts each rule fires. Never import this file.
import Phaser from 'phaser';
import { createHostClient } from '@pcg/net-client';
import type { ThemeShared } from '../../../themes/types';

export const renderer = Phaser.AUTO; // no phaser
export const client = createHostClient; // no net-client
export type Theme = ThemeShared; // no themes
export const title = document.title; // no DOM
export const roll = Math.random(); // determinism
export const now = Date.now(); // determinism
export const perf = performance.now(); // determinism
export const date = new Date(); // determinism
