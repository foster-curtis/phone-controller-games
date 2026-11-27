// Builds the round's views (SPEC §12.3 "Views"): `WorldView` for the renderer every frame and the
// debug-only `DebugView`. Guards carry their view cone (TF9's `guardView`, wired at TF12). A `CharacterView` is built key by key from the allowlist, so a player's
// character and an NPC give the same shape and nothing about who controls it (SPEC §6.11).
import { guardView } from './guards';
import type { CharacterView, DebugView, WorldView } from './snapshot';
import type { Balance } from '../../content/types';
import type { Character, World } from './types';
import { STEP_MS } from './types';

export function characterView(c: Character): CharacterView {
  return {
    id: c.id,
    rig: 'citizen',
    outfit: { ...c.outfit },
    pose: c.pose,
    x: c.x,
    y: c.y,
    facing: c.facing,
    gait: c.gait,
  };
}

export function worldView(world: World, balance: Balance): WorldView {
  const timeLeftMs =
    world.phase === 'play' && world.phaseEndsAt !== null
      ? Math.max(0, (world.phaseEndsAt - world.tick) * STEP_MS)
      : 0;
  return {
    tick: world.tick,
    phase: world.phase,
    timeLeftMs,
    characters: world.characters.map(characterView),
    merchants: world.merchants.map((m) => ({
      id: m.id,
      rig: 'merchant',
      stall: m.stall,
      pose: m.pose,
      x: m.x,
      y: m.y,
      facing: m.facing,
      gait: m.gait,
      glance: m.glance ? m.glance.stage : 'none',
      question: m.coin !== null,
      shoutingAt: m.shouting ? m.shouting.at : null,
      carrying: m.carrying,
    })),
    guards: world.guards.map((g) => guardView(g, world.tick, balance)),
    stalls: world.stalls.map((s) => ({
      id: s.id,
      shop: s.shop,
      open: s.open,
      counter: s.slots.filter((x) => x.row === 'counter' || x.forward).map((x) => x.item),
      shelf: s.slots.filter((x) => x.row === 'shelf' && !x.forward).map((x) => x.item),
    })),
    coins: [], // TF13 (coin flight)
    stocks: world.stocks.map((s) => ({
      slot: s.slot,
      character: s.character,
      endsInMs: s.character === null ? 0 : Math.max(0, (s.releaseAt - world.tick) * STEP_MS),
    })),
    bubbles: [],
    gateOpen: world.gateOpen,
  };
}

export function debugView(world: World): DebugView {
  return {
    characters: world.characters.map((c) => ({
      id: c.id,
      control: c.control.k,
      hot: world.tick < c.hotUntil,
      npcState: c.npc.state,
    })),
    activations: world.activations,
    plannedNpcs: world.plannedNpcs,
    liveNpcs: world.characters.filter((c) => c.control.k === 'npc').length,
  };
}
