// The one citizen builder (SPEC §6.11, §12.3): players' characters and NPCs are built by the same
// function with the same fields in the same order, a mind from `createMind` and an outfit from
// `assignOutfit` over the round's `outfits` stream, so nothing about a character's construction says
// "player". Ids come from `world.nextId` (never reused).
import type { Outfit } from '../../content/types';
import type { Activity, Character, Control, Npc, Side, World } from './types';

export function makeCitizen(
  world: World,
  at: { x: number; y: number },
  radius: number,
  outfit: Outfit,
  mind: Npc,
  control: Control,
  side: Side | null,
  activity: Activity,
  facing: number,
): Character {
  const c: Character = {
    id: world.nextId++,
    x: at.x,
    y: at.y,
    vx: 0,
    vy: 0,
    r: radius,
    rig: 'citizen',
    outfit,
    facing,
    gait: 'idle',
    pose: 'idle',
    activity,
    control,
    side,
    npc: mind,
    hotUntil: -1,
    holdEndedAt: -1,
    immuneUntil: 0,
    tossReadyAt: 0,
  };
  mind.nav!.lastX = c.x;
  mind.nav!.lastY = c.y;
  return c;
}
