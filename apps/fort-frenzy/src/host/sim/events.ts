// Sim events (SPEC §15.3): what happened this step, for render, audio and phone sync. The sim clears
// `World.events` at the start of each step and pushes in the order things happen.
// Frozen at FF1 (BUILD_PLAN §3). Append-only registry: add members at the end of the union, never
// reorder, remove or change one.
import type { AckReason } from '../../shared/messages';
import type { CardId, ClassId, EnemyId, LaneId, ShopItemId, StructureId } from '../../shared/ids';
import type { Tile } from '../../content/types';
import type { DamageKind, EntityId, Phase } from './types';

export type SimEvent =
  /** A sim command was applied (`ok`) or refused; `ref` is the command's own tag (intent ack). */
  | { e: 'command'; ref: number; slot: number; ok: boolean; reason?: AckReason }
  | { e: 'phase'; phase: Phase; wave: number }
  /** A lane glows ~3 s before a group spawns from it (§9.4). */
  | { e: 'laneWarning'; lane: LaneId; spawnsAtTick: number }
  | { e: 'spawn'; id: EntityId; enemy: EnemyId; lane: LaneId | null }
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
  | { e: 'built'; id: EntityId; structure: StructureId; tile: Tile; slot: number }
  | { e: 'destroyed'; id: EntityId; structure: StructureId; tile: Tile }
  | { e: 'snareDischarge'; id: EntityId; left: number }
  | {
      e: 'crate';
      action: 'pickup' | 'deliver' | 'buy' | 'give' | 'drop' | 'throw';
      slot: number;
      to: number | null;
      x: number;
      y: number;
    }
  | { e: 'kitUsed'; slot: number }
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
  /** FF12: a Fault Line stomp shocked every wall on the map (each wall flashes on the TV). */
  | { e: 'faultLine'; slot: number };

export type SimEventKind = SimEvent['e'];
