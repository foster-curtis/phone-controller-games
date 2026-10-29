// Generic damage pipeline: every hit goes through `applyDamage` (SPEC §15.3). Extraction-ready (§15.1):
// ids and damage kinds are generics, so the sim's `DamageCalc`/`DamageResult` fit as they are. The
// caller supplies each stage (hooks, shields, HP); this module fixes their order:
// 1 base → 2 attacker outgoing → 3 crit (no-op in v1) → 4 target incoming → 5 shields → 6 HP → 7 after.
// Difficulty and player-count multipliers are baked into stats at spawn, not applied here.
// Frozen at FF2 (BUILD_PLAN §3): additive changes only.

export interface DamageCalcOf<Id = number, K extends string = string> {
  source: Id | null;
  target: Id;
  amount: number;
  kind: K;
  /** Stages may push tags (e.g. what the hit was strong against). */
  tags: string[];
}

export interface DamageResultOf<Id = number, K extends string = string> {
  source: Id | null;
  target: Id;
  kind: K;
  tags: readonly string[];
  /** After modifiers, before shields. */
  amount: number;
  /** Taken by shields. */
  absorbed: number;
  /** Taken from HP. */
  dealt: number;
  killed: boolean;
}

export interface DamageStages<Id = number, K extends string = string> {
  /** Stage 2: the attacker's `modifyOutgoing` hooks (mutate `calc.amount`/`tags`). */
  outgoing?(calc: DamageCalcOf<Id, K>): void;
  /** Stage 3: crits (no-op in v1, SPEC §13). */
  crit?(calc: DamageCalcOf<Id, K>): void;
  /** Stage 4: the target's `modifyIncoming` hooks. */
  incoming?(calc: DamageCalcOf<Id, K>): void;
  /** Stage 5: shields; returns how much of `amount` they absorbed (clamped to 0..amount). */
  absorb?(calc: DamageCalcOf<Id, K>, amount: number): number;
  /** Stage 6: takes `amount` from HP; `killed` only on the hit that brings HP to 0. */
  takeHp(calc: DamageCalcOf<Id, K>, amount: number): { dealt: number; killed: boolean };
  /** Stage 7: events (super charge, boss stagger, run stats, damage and death hooks, coins). */
  after?(result: DamageResultOf<Id, K>): void;
}

/** Runs one hit through the stages in order. `calc` is mutated by stages 2–4. */
export function applyDamage<Id, K extends string>(
  calc: DamageCalcOf<Id, K>,
  stages: DamageStages<Id, K>,
): DamageResultOf<Id, K> {
  stages.outgoing?.(calc);
  stages.crit?.(calc);
  stages.incoming?.(calc);
  const amount = Math.max(0, calc.amount);
  const absorbed = stages.absorb ? Math.min(amount, Math.max(0, stages.absorb(calc, amount))) : 0;
  const { dealt, killed } = stages.takeHp(calc, amount - absorbed);
  const result: DamageResultOf<Id, K> = {
    source: calc.source,
    target: calc.target,
    kind: calc.kind,
    tags: calc.tags,
    amount,
    absorbed,
    dealt,
    killed,
  };
  stages.after?.(result);
  return result;
}

/** A stage-6 helper for anything with `hp`: clamps at 0, reports the killing hit once. */
export function hpStage(target: {
  hp: number;
}): (calc: unknown, amount: number) => { dealt: number; killed: boolean } {
  return (_calc, amount) => {
    if (target.hp <= 0 || amount <= 0) return { dealt: 0, killed: false };
    const dealt = Math.min(target.hp, amount);
    target.hp -= dealt;
    return { dealt, killed: target.hp <= 0 };
  };
}

/** `amount` less a damage-reduction fraction (clamped to 0..1). */
export function reduceBy(amount: number, fraction: number): number {
  return amount * (1 - Math.min(1, Math.max(0, fraction)));
}
