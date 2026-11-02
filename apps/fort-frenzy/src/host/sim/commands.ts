// Step 1 (SPEC §15.3): commands in logged order. Each answers with a `command` event when it carries
// a `ref` (the intent ack, BUILD_PLAN §8 FF1).
import type { AckReason } from '../../shared/messages';
import { buildAtFeet } from './building';
import { buyCrate, dropAll, give } from './crates';
import { spawnGroup, startBuild } from './lifecycle';
import { releaseAll } from './players';
import type { FullState } from './state';
import type { PlayerEnt, SimCommand } from './types';

function daze(s: FullState, p: PlayerEnt) {
  dropAll(s, p);
  releaseAll(p);
  p.push = null;
}

function apply(s: FullState, cmd: SimCommand): AckReason | null {
  const w = s.world;
  if (cmd.c === 'debug') return debug(s, cmd);
  const p = s.player(cmd.slot);
  if (!p) return 'invalid';
  switch (cmd.c) {
    case 'presence': {
      if (p.connected === cmd.connected) return null;
      p.connected = cmd.connected;
      // The first sample after a (re)connect only re-baselines the counters (§15.3).
      s.inputs.get(p.slot)!.baseline = true;
      if (!cmd.connected) daze(s, p);
      s.emit({ e: 'presence', slot: p.slot, connected: cmd.connected });
      return null;
    }
    case 'ready':
      if (w.phase !== 'build') return 'phase';
      p.ready = cmd.ready;
      return null;
    case 'build': {
      if (w.phase !== 'build') return 'phase';
      if (cmd.action === 'cancel') {
        p.ghost = null;
        return null;
      }
      if (cmd.action === 'select') {
        if (!s.cat.character(p.classId).build.includes(cmd.structure)) return 'invalid';
        p.ghost = cmd.structure;
        return null;
      }
      if (p.ghost === null || p.respawnAt !== null || !p.connected) return 'invalid';
      const why = buildAtFeet(s, p, p.ghost);
      if (why === null) p.ghost = null;
      return why;
    }
    case 'buy':
      // The phone shop (§10.3); only crates until the team shop lands (FF12).
      if (cmd.item !== 'crate') return 'invalid';
      if (w.phase !== 'build') return 'phase';
      return buyCrate(s, p);
    case 'give':
      if (p.respawnAt !== null || !p.connected) return 'invalid';
      return give(s, p);
    case 'join':
    case 'request':
    case 'card':
      // Late joins (FF14), the wishlist and cards (FF12).
      return 'invalid';
  }
}

function debug(s: FullState, cmd: Extract<SimCommand, { c: 'debug' }>): AckReason | null {
  const w = s.world;
  switch (cmd.action) {
    case 'invincible':
      for (const p of w.players) if (cmd.slot === -1 || p.slot === cmd.slot) p.invincible = cmd.on;
      return null;
    case 'coins':
      w.team.coins = Math.max(0, w.team.coins + cmd.amount);
      return null;
    case 'spawn':
      spawnGroup(s, cmd.enemy, cmd.lane, 1);
      return null;
    case 'jumpWave': {
      const last = s.cat.waves[s.cat.waves.length - 1]?.n ?? 1;
      const n = Math.min(last, Math.max(1, Math.floor(cmd.wave)));
      for (const e of w.enemies) s.removeUnit(e.id);
      w.enemies.length = 0;
      w.spawns.length = 0;
      if (w.fields.dirty) s.rebuildFields();
      startBuild(s, n);
      return null;
    }
  }
}

export function applyCommands(s: FullState, cmds: readonly SimCommand[]): void {
  for (const cmd of cmds) {
    const reason = apply(s, cmd);
    if (cmd.ref !== undefined) {
      s.emit(
        reason === null
          ? { e: 'command', ref: cmd.ref, slot: cmd.slot, ok: true }
          : { e: 'command', ref: cmd.ref, slot: cmd.slot, ok: false, reason },
      );
    }
  }
}
