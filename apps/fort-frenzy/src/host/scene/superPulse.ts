// Super ready on the TV (SPEC §2.6, §10.1; C2 note 3): no badge over the head; the player's ring
// pulses with amber light instead, at the phone ring's rate and scale. The colored ring stays drawn
// on top, so the player color still reads. Pure, so it's tested.
import { theme } from '../../shared/theme';
import type { PlayerEnt } from '../sim/types';

/** The phone's super ring pulse (§10.1): 1.0 → 1.12 and back at 1.2 Hz. */
export const SUPER_PULSE_HZ = 1.2;
export const SUPER_PULSE_SCALE = 0.12;

export interface SuperPulse {
  /** The theme's amber (bloom picks it up). */
  color: number;
  /** Ring radius factor, 1 → 1 + SUPER_PULSE_SCALE. */
  scale: number;
  alpha: number;
}

/** The amber pulse for a knight at `tMs`, or null while the super charges or the knight is down. */
export function superPulse(
  p: Pick<PlayerEnt, 'superCharge' | 'respawnAt'>,
  tMs: number,
): SuperPulse | null {
  if (p.superCharge < 1 || p.respawnAt !== null) return null;
  const u = 0.5 * (1 - Math.cos(tMs * 0.001 * SUPER_PULSE_HZ * Math.PI * 2));
  return { color: theme.color.amber.num, scale: 1 + SUPER_PULSE_SCALE * u, alpha: 0.5 + 0.5 * u };
}
