// Dodger name lists for shared phones (SPEC §6.3.1): "Ana, Leo, Mia: scatter!" names every seat on
// the phone. A single-seat phone keeps the plain copy.
import type { ScreenSeat } from '../../shared/messages';

/** "Ana, Leo, Mia" for a phone with 2+ seats, else null. */
export function seatNames(seats: readonly ScreenSeat[]): string | null {
  return seats.length >= 2 ? seats.map((s) => s.name).join(', ') : null;
}

/** `plain` for one seat; `Ana, Leo, Mia: scatter!` for several (`plain` is "Scatter!"). */
export function dodgerLine(seats: readonly ScreenSeat[], plain: string): string {
  const names = seatNames(seats);
  if (!names) return plain;
  return `${names}: ${plain.charAt(0).toLowerCase()}${plain.slice(1)}`;
}
