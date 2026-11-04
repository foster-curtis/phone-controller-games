// Commander card modules (SPEC §6.1): Forced March, Siege Breakers, Veterans, Last Stand, Vanguard and
// the Warcry combo. Bladework and Rally Cry are plain stat cards (content/cards.ts). Squad cards
// change how the squad behaves, never its raw stats (shop): the Commander's module keeps a small
// modifier on each of his soldiers, which reads his current stacks live (a re-pick needs no resync).
import { dist } from '../geometry';
import { squadSize } from '../squad';
import { state, type SimState } from '../internal';
import type { Modifier, ModuleDef, PlayerEnt, SoldierEnt } from '../types';
import { enemyTarget, num, stacksOf } from './common';

function ownSoldiers(s: SimState, slot: number): SoldierEnt[] {
  return s.world.soldiers.filter((u) => u.owner === slot && u.hp > 0);
}

/** Gives each of the Commander's soldiers the modifier `id` once. */
function ensureSquadMod(s: SimState, me: PlayerEnt, id: string, make: (u: SoldierEnt) => Modifier) {
  for (const u of ownSoldiers(s, me.slot)) if (!u.mods.some((m) => m.id === id)) u.mods.push(make(u));
}

const stacksOfCard = (s: SimState, slot: number, card: 'siege_breakers' | 'last_stand' | 'veterans') =>
  s.player(slot)?.cards[card] ?? 0;

/** The squad moves faster, following and to the flag: a refreshed haste on each soldier. */
export const forcedMarch: ModuleDef = {
  id: 'forced_march',
  make(p) {
    const strength = num(p, 'pct', 0.2) * stacksOf(p);
    const auraMs = num(p, 'auraMs', 200);
    return {
      id: 'card:forced_march',
      hooks: {
        onTick(ctx, self) {
          const s = state(ctx);
          for (const u of ownSoldiers(s, (self as PlayerEnt).slot))
            ctx.applyEffect(u.id, { effect: 'haste', strength, durationMs: auraMs }, self.id);
        },
      },
    };
  },
};

/** The squad deals +`pct` × stacks damage to Siege. */
export const siegeBreakers: ModuleDef = {
  id: 'siege_breakers',
  make(p) {
    const pct = num(p, 'pct', 0.5);
    return {
      id: 'card:siege_breakers',
      hooks: {
        onTick(ctx, self) {
          const s = state(ctx);
          const me = self as PlayerEnt;
          ensureSquadMod(s, me, 'squad:siege_breakers', () => ({
            id: 'squad:siege_breakers',
            hooks: {
              modifyOutgoing(c, _u, d) {
                const e = enemyTarget(c, d.target);
                if (e?.kind === 'siege') d.amount *= 1 + pct * stacksOfCard(state(c), me.slot, 'siege_breakers');
              },
            },
          }));
        },
      },
    };
  },
};

/** The squad deals +`pct` × stacks damage per soldier lost from its full size. */
export const lastStand: ModuleDef = {
  id: 'last_stand',
  make(p) {
    const pct = num(p, 'pct', 0.15);
    return {
      id: 'card:last_stand',
      hooks: {
        onTick(ctx, self) {
          const s = state(ctx);
          const me = self as PlayerEnt;
          ensureSquadMod(s, me, 'squad:last_stand', () => ({
            id: 'squad:last_stand',
            hooks: {
              modifyOutgoing(c, _u, d) {
                const st = state(c);
                const sizes = st.cat.character(me.classId).squad?.size ?? [];
                const full = squadSize(st.cat.waves, sizes, st.world.wave);
                const lost = Math.max(0, full - ownSoldiers(st, me.slot).length);
                d.amount *= 1 + pct * lost * stacksOfCard(st, me.slot, 'last_stand');
              },
            },
          }));
        },
      },
    };
  },
};

/**
 * Soldiers who survive a wave permanently gain `gain` × stacks max HP and damage per wave survived
 * (up to `max` waves). Survivors are the soldiers alive at the end of combat: the build phase's
 * replacements are new entities, so they start fresh.
 */
export const veterans: ModuleDef = {
  id: 'veterans',
  make(p) {
    const gain = num(p, 'gain', 0.1);
    const max = num(p, 'max', 5);
    // On the modifier (not a closure) so the state hash sees it.
    const m: Modifier & { alive: number[]; fighting: boolean } = {
      id: 'card:veterans',
      alive: [],
      fighting: false,
      hooks: {
        onTick(ctx, self) {
          const s = state(ctx);
          const me = self as PlayerEnt;
          const k = gain * Math.max(1, stacksOfCard(s, me.slot, 'veterans'));
          ensureSquadMod(s, me, 'squad:veterans', (u) => ({
            id: 'squad:veterans',
            get stats() {
              const v = Math.min(max, u.veterans) * k;
              return v > 0
                ? [
                    { stat: 'maxHp' as const, addPct: v },
                    { stat: 'damage' as const, addPct: v },
                  ]
                : [];
            },
          }));
          if (s.world.phase === 'combat') {
            m.fighting = true;
            m.alive = ownSoldiers(s, me.slot).map((u) => u.id);
            return;
          }
          if (!m.fighting) return;
          m.fighting = false;
          if (s.world.phase !== 'build') return;
          const baseHp = s.cat.character(me.classId).squad?.soldier.hp ?? 0;
          for (const u of ownSoldiers(s, me.slot)) {
            if (!m.alive.includes(u.id) || u.veterans >= max) continue;
            u.veterans++;
            // The new max HP lands on the next stat refresh; the gain heals in with it.
            u.hp += baseHp * k;
          }
          m.alive = [];
        },
      },
    };
    return m;
  },
};

/** The Commander takes less damage while one of his soldiers is within `radius` (an aura, capped). */
export const vanguard: ModuleDef = {
  id: 'vanguard',
  make(p) {
    const radius = num(p, 'radius', 3);
    const strength = num(p, 'reduction', 0.2) * stacksOf(p);
    const auraMs = num(p, 'auraMs', 200);
    return {
      id: 'card:vanguard',
      hooks: {
        onTick(ctx, self) {
          const s = state(ctx);
          const me = self as PlayerEnt;
          if (!s.targetable(me)) return;
          if (!ownSoldiers(s, me.slot).some((u) => dist(me.x, me.y, u.x, u.y) <= radius)) return;
          ctx.applyEffect(me.id, { effect: 'aura_vanguard', strength, durationMs: auraMs }, me.id);
        },
      },
    };
  },
};

/** The super also gives morale to other players within `radius`, briefly. */
export const warcry: ModuleDef = {
  id: 'warcry',
  make(p) {
    const radius = num(p, 'radius', 4);
    const strength = num(p, 'strength', 0.2);
    const durationMs = num(p, 'durationMs', 4000);
    return {
      id: 'card:warcry',
      hooks: {
        onAttack(ctx, self, atk) {
          if (atk.slot !== 'super') return;
          const s = state(ctx);
          const me = self as PlayerEnt;
          for (const q of s.world.players) {
            if (q === me || !s.targetable(q) || dist(me.x, me.y, q.x, q.y) > radius) continue;
            ctx.applyEffect(q.id, { effect: 'morale', strength, durationMs }, me.id);
          }
        },
      },
    };
  },
};
