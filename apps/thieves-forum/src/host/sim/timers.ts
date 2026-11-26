// Step 13, timers (SPEC §6.2, §12.3): the round clock. The players-only opening ends after
// `balance.match.openingMs` and play runs `balance.match.roundMs`, then hands up. Hot hands, catch
// grace and immunity are tick stamps compared where they're used; stocks countdowns are TF9's.
import type { StepContext } from './systems';

export function stepTimers(ctx: StepContext): void {
  const { world, content } = ctx;
  // The step's tick advances after this system: compare against the next tick.
  const next = world.tick + 1;
  if (world.phaseEndsAt === null || next < world.phaseEndsAt) return;
  if (world.phase === 'opening') {
    world.phase = 'play';
    world.phaseEndsAt = next + ctx.ticks(content.balance.match.roundMs);
    ctx.emit({ ch: 'tv', e: 'phase', phase: 'play' });
  } else if (world.phase === 'play') {
    world.phase = 'handsUp';
    world.phaseEndsAt = null;
    ctx.emit({ ch: 'tv', e: 'phase', phase: 'handsUp' });
  }
}
