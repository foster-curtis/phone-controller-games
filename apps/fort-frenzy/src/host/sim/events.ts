// Sim events (SPEC §15.3): what happened this step, for render, audio and phone sync. The sim clears
// `World.events` at the start of each step and pushes in the order things happen.
// Frozen after RD2 (REDESIGN_BUILD_PLAN §3). Append-only registry: add members at the end of the
// union, never reorder, remove or change one. RD2 removed the TD members (supply, structures,
// placement, lane warnings, the old Fault Line) and changed `spawn.lane` to `portal`.
import type { AckReason } from '../../shared/messages';
import type { BuildId, CardId, ClassId, EnemyId, PortalId, ShopItemId } from '../../shared/ids';
import type { DamageKind, EntityId, Phase } from './types';

export type SimEvent =
  /** A sim command was applied (`ok`) or refused; `ref` is the command's own tag (intent ack). */
  | { e: 'command'; ref: number; slot: number; ok: boolean; reason?: AckReason }
  | { e: 'phase'; phase: Phase; wave: number }
  | { e: 'spawn'; id: EntityId; enemy: EnemyId; portal: PortalId | null }
  /** An attack went off (muzzle flash, swing, SFX). `slot` is the attacker's button or `attack`. */
  | {
      e: 'attack';
      source: EntityId;
      slot: 'main' | 'super' | 'attack';
      x: number;
      y: number;
      angle: number;
    }
  | {
      e: 'damage';
      source: EntityId | null;
      target: EntityId;
      amount: number;
      kind: DamageKind;
      killed: boolean;
    }
  | { e: 'heal'; source: EntityId | null; target: EntityId; amount: number }
  | {
      e: 'death';
      id: EntityId;
      what: 'player' | 'soldier' | 'enemy';
      killer: EntityId | null;
      x: number;
      y: number;
    }
  | { e: 'respawn'; slot: number }
  | { e: 'baseHit'; amount: number; hp: number }
  /** Base HP crossed the 25% alarm line (§3.3), either way. */
  | { e: 'baseAlarm'; on: boolean }
  | { e: 'purchase'; slot: number; item: ShopItemId; tier: number }
  | { e: 'request'; slot: number; item: ShopItemId; on: boolean }
  | { e: 'cardPicked'; slot: number; card: CardId }
  | { e: 'superReady'; slot: number }
  | { e: 'flag'; slot: number; action: 'plant' | 'recall' }
  /** A danger marker appeared (boss wind-up telegraph). */
  | { e: 'marker'; id: EntityId; source: EntityId; landsAtTick: number }
  | { e: 'stagger'; id: EntityId; on: boolean }
  | { e: 'waveCleared'; wave: number }
  | { e: 'lateJoin'; slot: number; classId: ClassId }
  | { e: 'presence'; slot: number; connected: boolean }
  | { e: 'runEnd'; result: 'victory' | 'defeat'; wave: number }
  // ---- redesign (RD2, SPEC §15.3): builds, portals, Hunter lock-on, Reinforcements, growth ----
  | { e: 'buildPlaced'; slot: number; build: EntityId; kind: BuildId }
  | { e: 'buildLanded'; build: EntityId }
  | { e: 'buildHit'; build: EntityId }
  | { e: 'buildGone'; build: EntityId; kind: BuildId; destroyed: boolean }
  | { e: 'mineTrigger'; build: EntityId }
  | { e: 'mineBurst'; build: EntityId }
  /** The Commander recalled his rally flag (the build button with the meter not full). */
  | { e: 'recall'; slot: number }
  /** A portal flares `rules.flareMs` before it spawns a group (§9.4). */
  | { e: 'portalFlare'; portal: PortalId }
  | { e: 'bruteTarget'; enemy: EntityId; build: EntityId }
  | { e: 'huntLock'; enemy: EntityId; slot: number }
  /** Reinforcements threw `count` soldiers (2 = the Rally Cry "×2"). */
  | { e: 'reinforce'; slot: number; count: number }
  | { e: 'growth'; slot: number; boss: boolean }
  /** The build-phase deadline picked a card for a player (§10.2). */
  | { e: 'cardAuto'; slot: number; card: CardId }
  // ---- RD3 ----
  /**
   * A build's HP bar (§7.5): sent when an HP build lands and whenever it takes damage (with
   * `buildHit`). Mines and the flag have no HP and never send it.
   */
  | {
      e: 'buildHp';
      build: EntityId;
      kind: BuildId;
      owner: number;
      hp: number;
      maxHp: number;
    }
  // ---- RD3-fix-1 ----
  /** A knight's wound-up attack was cut short (down, dazed, phase end): it won't land (§8.2). */
  | { e: 'windupCancelled'; source: EntityId; slot: 'main' | 'super' };

export type SimEventKind = SimEvent['e'];
