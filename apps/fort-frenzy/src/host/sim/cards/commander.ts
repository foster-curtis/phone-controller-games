// Commander card modules (SPEC §6.1): Rally Cry, Morale, Siege Breakers, Veterans, Last Stand, Vanguard
// and the Warcry combo. Heavy Bash, Forced March, Drillmaster and Reinforced Ranks are plain stat cards
// (content/balance.ts; the squad reads its `squad*` stats from him, squad/index.ts). The Commander's
// module keeps a small modifier on each of his soldiers, which reads his current stacks live (a re-pick
// needs no resync).
import type { Rng } from '@pcg/game-kit';
import { dist } from '../geometry';
import { applyMorale } from '../modules/morale';
import { squadCapOf } from '../squad';
import { state, type SimState } from '../internal';
import type { Modifier, ModuleDef, PlayerEnt, SoldierEnt } from '../types';
import { enemyTarget, num, stacksOf } from './common';

function ownSoldiers(s: SimState, slot: number): SoldierEnt[] {
  return s.world.soldiers.filter((u) => u.owner === slot && u.hp > 0);
}

/** Gives each of the Commander's soldiers the modifier `id` once. */
function ensureSquadMod(s: SimState, me: PlayerEnt, id: string, make: (u: SoldierEnt) => Modifier) {
  for (const u of ownSoldiers(s, me.slot))
    if (!u.mods.some((m) => m.id === id)) u.mods.push(make(u));
}

const stacksOfCard = (
  s: SimState,
  slot: number,
  card: 'siege_breakers' | 'last_stand' | 'veterans',
) => s.player(slot)?.cards[card] ?? 0;

/** Rally Cry's chance of a second soldier at `stacks` copies: +`perCopy` per extra, up to 100%. */
export const rallyCryChance = (stacks: number, chance: number, perCopy: number): number =>
  Math.min(1, chance + perCopy * Math.max(0, stacks - 1));

/** One Reinforcements roll, from the seeded combat stream. A sure thing draws nothing. */
export function rollRallyCry(rng: Rng, chance: number): boolean {
  if (chance >= 1) return true;
  return chance > 0 && rng.next() < chance;
}

/** Reinforcements may throw 2 soldiers instead of 1 (§6.1); the TV shows "×2". */
export const rallyCry: ModuleDef = {
  id: 'rally_cry',
  make(p) {
    const chance = rallyCryChance(stacksOf(p), num(p, 'chance'), num(p, 'perCopy'));
    return {
      id: 'card:rally_cry',
      hooks: {
        onAttack(ctx, _self, atk) {
          if (atk.slot !== 'super') return;
          const s = state(ctx);
          if (rollRallyCry(s.rng(`combat:${s.world.wave}`), chance)) atk.count = 2;
        },
      },
    };
  },
};

/**
 * Morale (§6.1): allied knights and soldiers near him gain damage, attack rate and movement. His
 * flag holds the same area (builds/rallyFlag.ts, so it works while he's down); inside both a unit
 * still has one effect. No visual of its own.
 */
export const moraleCard: ModuleDef = {
  id: 'morale',
  make(p) {
    const radius = num(p, 'radius');
    num(p, 'flagRadius');
    const fx = {
      effect: 'morale' as const,
      strength: num(p, 'strength'),
      durationMs: num(p, 'auraMs'),
    };
    return {
      id: 'card:morale',
      hooks: {
        onTick(ctx, self) {
          const s = state(ctx);
          const me = self as PlayerEnt;
          if (s.world.phase !== 'combat' || !s.targetable(me)) return;
          applyMorale(s, me.id, me.x, me.y, radius, fx);
        },
      },
    };
  },
};

/** The squad deals +`pct` × stacks damage to Siege. */
export const siegeBreakers: ModuleDef = {
  id: 'siege_breakers',
  make(p) {
    const pct = num(p, 'pct');
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
                if (e?.kind === 'siege')
                  d.amount *= 1 + pct * stacksOfCard(state(c), me.slot, 'siege_breakers');
              },
            },
          }));
        },
      },
    };
  },
};

/** The squad deals +`pct` × stacks damage per soldier short of its cap (§6.1). */
export const lastStand: ModuleDef = {
  id: 'last_stand',
  make(p) {
    const pct = num(p, 'pct');
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
                const squad = st.cat.knight(me.classId).squad;
                if (!squad) return;
                const cap = squadCapOf(squad, (b) => st.attackStat(me, b, 'squadCap', 'squad'));
                const lost = Math.max(0, cap - ownSoldiers(st, me.slot).length);
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
 * (up to `max` waves). Survivors are the soldiers alive at the end of combat; one thrown in later
 * starts fresh.
 */
export const veterans: ModuleDef = {
  id: 'veterans',
  make(p) {
    const gain = num(p, 'gain');
    const max = num(p, 'max');
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
          const baseHp = s.cat.knight(me.classId).squad?.soldier.hp ?? 0;
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
    const radius = num(p, 'radius');
    const strength = num(p, 'reduction') * stacksOf(p);
    const auraMs = num(p, 'auraMs');
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

/** Reinforcements also gives other knights within `radius` morale, briefly, with its flash (§6.1). */
export const warcry: ModuleDef = {
  id: 'warcry',
  make(p) {
    const radius = num(p, 'radius');
    const strength = num(p, 'strength');
    const durationMs = num(p, 'durationMs');
    return {
      id: 'card:warcry',
      hooks: {
        onAttack(ctx, self, atk) {
          if (atk.slot !== 'super') return;
          const s = state(ctx);
          const me = self as PlayerEnt;
          const targets: number[] = [];
          for (const q of s.world.players) {
            if (q === me || !s.targetable(q) || dist(me.x, me.y, q.x, q.y) > radius) continue;
            ctx.applyEffect(q.id, { effect: 'morale', strength, durationMs }, me.id);
            targets.push(q.id);
          }
          if (targets.length > 0) s.emit({ e: 'warcry', slot: me.slot, targets, durationMs });
        },
      },
    };
  },
};
