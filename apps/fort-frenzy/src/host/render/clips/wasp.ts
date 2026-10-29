// Wasp drone (Flyer) clips (SPEC §9.6): no legs. It bobs at a fixed height (never toward the
// ground); the rotor discs flicker to read as spinning.
import type { Clip } from '../../../themes/types';
import { each, loop, sin, wave } from '../clipKit';

const rotors = (ms: number) =>
  each(
    ['rotor-near', 'rotor-far'],
    wave(ms, 4, (u) => ({ sx: 1 - 0.18 * Math.abs(sin(u * 4)) })),
  );

export const clips: Record<string, Clip> = {
  idle: loop(1200, { body: wave(1200, 8, (u) => ({ dy: 2 * sin(u) })) }, rotors(1200)),
  walk: loop(
    900,
    { body: wave(900, 8, (u) => ({ dy: 2 * sin(u), rot: 4 + 1.5 * sin(u) })) },
    rotors(900),
  ),
};
