// Sim events → sound cues (SPEC §12; BUILD_PLAN FF13). Append-only registry (REDESIGN_BUILD_PLAN §3):
// add entries at the end, never reorder or delete. RD2: the build cues; RD13: mines, shield, beacon, portal, Brute, Charge, slam, Rally Cry.
import type { SfxId } from '../../shared/ids';
import type { SimEvent } from '../sim/events';

/** What an entity id is, for cues that depend on the target (resolved from the world). */
export type EntityKind = 'player' | 'enemy' | 'other';

export interface Cue {
  /** Which event plays it. */
  on: SimEvent['e'];
  sfx: SfxId;
  /** Optional filter on the event. */
  when?: (e: SimEvent, kindOf: (id: number) => EntityKind) => boolean;
}

export const cues: readonly Cue[] = [
  { on: 'baseAlarm', sfx: 'base_alarm', when: (e) => e.e === 'baseAlarm' && e.on },
  { on: 'baseHit', sfx: 'base_hit' },
  {
    on: 'damage',
    sfx: 'player_hit',
    when: (e, k) => e.e === 'damage' && k(e.target) === 'player',
  },
  {
    on: 'damage',
    sfx: 'enemy_hit',
    when: (e, k) => e.e === 'damage' && !e.killed && k(e.target) === 'enemy',
  },
  { on: 'death', sfx: 'enemy_death', when: (e) => e.e === 'death' && e.what === 'enemy' },
  // The boss telegraph marker is the wind-up (§9.4); FF11 may add richer events later.
  { on: 'marker', sfx: 'boss_windup' },
  { on: 'purchase', sfx: 'purchase' },
  { on: 'cardPicked', sfx: 'card_pick' },
  { on: 'phase', sfx: 'wave_start', when: (e) => e.e === 'phase' && e.phase === 'combat' },
  { on: 'runEnd', sfx: 'victory', when: (e) => e.e === 'runEnd' && e.result === 'victory' },
  { on: 'runEnd', sfx: 'defeat', when: (e) => e.e === 'runEnd' && e.result === 'defeat' },
  { on: 'buildPlaced', sfx: 'build_placed' },
  { on: 'buildGone', sfx: 'build_destroyed', when: (e) => e.e === 'buildGone' && e.destroyed },
  // RD13 (SPEC §12): the redesign's events.
  { on: 'mineTrigger', sfx: 'mine_trigger' },
  { on: 'mineBurst', sfx: 'mine_blast' },
  { on: 'buildHit', sfx: 'shield_hit', when: (e) => e.e === 'buildHit' && e.kind === 'shield_gen' },
  { on: 'beaconPulse', sfx: 'beacon_tick' },
  { on: 'portalFlare', sfx: 'portal_flare' },
  { on: 'bruteTarget', sfx: 'brute_lock' },
  { on: 'chargeWindup', sfx: 'charge_windup' },
  {
    on: 'windupLanded',
    sfx: 'slam_land',
    when: (e) => e.e === 'windupLanded' && e.slot === 'super',
  },
  // Reinforcements throwing two is the Rally Cry double (§8.4).
  { on: 'reinforce', sfx: 'rally_double', when: (e) => e.e === 'reinforce' && e.count >= 2 },
];

/** Plays the cues for a frame's events. */
export function playCues(
  events: readonly SimEvent[],
  play: (id: SfxId) => void,
  kindOf: (id: number) => EntityKind,
): void {
  // The Colossus's Charge announces a lane marker too: its own wind-up cue replaces the generic one.
  const chargeMarkers = new Set<number>();
  for (const e of events) if (e.e === 'chargeWindup') chargeMarkers.add(e.marker);
  for (const e of events) {
    if (e.e === 'marker' && chargeMarkers.has(e.id)) continue;
    for (const c of cues) if (c.on === e.e && (!c.when || c.when(e, kindOf))) play(c.sfx);
  }
}
