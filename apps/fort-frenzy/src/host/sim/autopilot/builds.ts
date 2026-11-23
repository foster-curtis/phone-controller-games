// The autopilot's build policy per knight (SPEC §15.9): when and where each knight places, throws or
// recalls its build, for the soak, the bench, the balance harness and later the squad-solo bots.
// Append-only registry (REDESIGN_BUILD_PLAN §3): add a knight's policy with its kit, never rename one.
// A policy reads only the world, so the autopilot stays deterministic.
import type { BuildDef, KnightDef, Vec2 } from '../../../content/types';
import type { KnightId } from '../../../shared/ids';
import { dist } from '../geometry';
import type { EnemyEnt, PlayerEnt, World } from '../types';

export interface BuildPolicyInput {
  world: World;
  self: PlayerEnt;
  knight: KnightDef;
  build: BuildDef;
  /** The nearest enemy the knight can fight, and how far it is. */
  nearest: EnemyEnt | null;
  nearestDist: number;
}

/** A build press now, with its aim (0,0 = a quick tap: at the feet), or null to hold it. */
export type BuildPolicy = (input: BuildPolicyInput) => { aim: Vec2 } | null;

/**
 * Warden: with a full meter and a fight within his throw range, drop the shield generator at his
 * feet, unless his current one still covers him.
 */
const warden: BuildPolicy = ({ world, self, build, nearestDist }) => {
  if (self.meter < 1 || !build.throw || nearestDist > build.throw.range) return null;
  const own = world.builds.find((b) => b.owner === self.slot);
  if (own && dist(own.x, own.y, self.x, self.y) <= build.radius * 0.6) return null;
  return { aim: { x: 0, y: 0 } };
};

/**
 * Ranger: with a full meter and a ground enemy closing in, drop a mine at his feet, unless one of his
 * own already covers the spot (so the three spread out along his retreat).
 */
const ranger: BuildPolicy = ({ world, self, build }) => {
  if (self.meter < 1) return null;
  const closing = world.enemies.some(
    (e) => e.hp > 0 && !e.flying && dist(e.x, e.y, self.x, self.y) <= build.radius * 3,
  );
  if (!closing) return null;
  const covered = world.builds.some(
    (b) => b.owner === self.slot && dist(b.x, b.y, self.x, self.y) <= build.radius,
  );
  return covered ? null : { aim: { x: 0, y: 0 } };
};

/** Artificer: the same rule with the beacon, so its healing covers him where he fights. */
const artificer: BuildPolicy = (input) => warden(input);

export const buildPolicies: Partial<Record<KnightId, BuildPolicy>> = {
  warden, // RD3
  ranger, // RD7
  artificer, // RD8
};
