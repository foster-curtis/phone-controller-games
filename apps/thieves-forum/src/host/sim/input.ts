// Step 1, input (SPEC §12.3): samples each player's input (already staleness-filtered by the host),
// records button edges for holds and catches, and turns the stick into a wanted velocity through the
// shared speed curve and acceleration (SPEC §6.10 player movement, §6.11). Players stand still outside
// `play` (the opening shows them standing; hands up freezes controls). Discrete commands are applied
// by the subsystems that own them (TF3 onward).
import { edgesOf, prevInputs } from './derived';
import { cleanVec } from './geometry';
import { easeVelocity, playerSpeed } from './movement';
import type { StepContext } from './systems';
import type { PlayerInput } from './types';

const IDLE: PlayerInput = { move: { x: 0, y: 0 }, hold: false, catch: false };

/** True while the character's own stick drives it (not browsing, holding, caught, …). */
const stickFree = (k: string) => k === 'free';

export function stepInput(ctx: StepContext): void {
  const { world, inputs, content } = ctx;
  const prev = prevInputs(world);
  const edges = edgesOf(world);
  edges.clear();
  for (const c of world.characters) {
    if (c.control.k !== 'player') continue;
    const id = c.control.playerId;
    const now = inputs.get(id) ?? IDLE;
    const was = prev.get(id) ?? IDLE;
    edges.set(id, {
      holdRose: now.hold && !was.hold,
      holdFell: !now.hold && was.hold,
      catchRose: now.catch && !was.catch,
    });
    prev.set(id, { move: { ...now.move }, hold: now.hold, catch: now.catch });
    if (world.phase !== 'play' || !stickFree(c.activity.k)) {
      easeVelocity(c, 0, 0);
      continue;
    }
    const m = cleanVec(now.move.x, now.move.y);
    const mag = Math.sqrt(m.x * m.x + m.y * m.y);
    const speed = playerSpeed(mag, content.balance);
    if (speed === 0) easeVelocity(c, 0, 0);
    else easeVelocity(c, (m.x / mag) * speed, (m.y / mag) * speed);
  }
}
