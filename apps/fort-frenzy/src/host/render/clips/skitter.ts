// Skitter (Runner) clips (SPEC §9.6): a fast low scuttle; the core pulses (faster near the base:
// code raises the playback speed).
import type { Clip } from '../../../themes/types';
import { each, loop, sin, walkerWalk, wave } from '../clipKit';

const pulse = (ms: number) =>
  each(
    ['core'],
    wave(ms, 8, (u) => ({ sx: 1 + 0.08 * sin(u), sy: 1 + 0.08 * sin(u) })),
  );

export const clips: Record<string, Clip> = {
  idle: loop(900, pulse(900)),
  walk: walkerWalk(
    320,
    ['body'],
    ['leg-far-a', 'leg-near-b'],
    ['leg-far-b', 'leg-near-a'],
    22,
    1.2,
    pulse(320),
  ),
};
