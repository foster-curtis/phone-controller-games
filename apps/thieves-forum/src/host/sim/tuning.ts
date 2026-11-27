// TF2 build tuning for the crowd and movement (SPEC §6.10, §12.3, §12.4): the numbers §7 doesn't give,
// kept in one place. Not frozen; values are starting points judged at C1. Every §7 value and the
// shared gait speeds stay in src/content/balance.ts. Units: ms, tiles, tiles/s, fractions.

export const TUNING = {
  /** Every citizen (player or NPC) eases toward its wanted velocity at this rate, tiles/s² (§6.11). */
  accel: 7,
  /** Player stick (§6.10 player movement): below `dead` stands; shuffle up to `walkFrom`; walk band
   *  up to `balance.movement.jogFrom`; jog above. */
  stick: { dead: 0.1, walkFrom: 0.4 },
  /** Below this speed a citizen counts as standing (gait `idle`, pose `idle`). */
  idleSpeed: 0.05,
  npc: {
    /** Technique 5: pause before choosing a direction, ms. */
    pauseMs: [500, 1400] as const,
    /** Buying at the counter (stub for TF13), ms. */
    buyMs: [600, 1000] as const,
    /** Technique 3: a passed stall within this distance of its customer spot may distract. */
    detourRadius: 2.5,
    /** Technique 3 outcomes once distracted (cumulative odds): slow, glance, else stop to browse. */
    detourSlow: 0.4,
    detourGlance: 0.75,
    /** Speed multiplier while slowed / glancing. */
    slowFactor: 0.55,
    glanceFactor: 0.4,
    /** How long a slow or glance lasts, ms. */
    slowMs: [900, 1800] as const,
    /** A detour browse is this fraction of the personality's browse time. */
    detourBrowse: 0.5,
    /** Technique 3 forgetting: chance per leg = distractibility × this. */
    forget: 0.5,
    /** Technique 5 waiting in line: give up after this long, ms. */
    waitMaxMs: 4000,
    /** Customer spots per stall along its counter, and the queue gap behind them (tiles). */
    spots: 3,
    queueGap: 1.1,
    /** Hurried NPCs walk briskly on this share of their legs (§6.10 gaits). */
    briskLeg: 0.5,
    /** Within this of a stall's customer spot the NPC picks a spot (approaching). */
    approachRadius: 3,
    /** Arrival: reached within `arrive`; slows down inside `slowRadius`. */
    arrive: 0.2,
    slowRadius: 1.0,
    /** A non-final waypoint counts as reached within this. */
    waypoint: 0.7,
    /** Wander drift (technique 2): random-walk step per tick and its clamp, radians. */
    wanderStep: 0.06,
    wanderMax: 1.1,
    /** Safety: nobody stands still longer than this (C1 "never frozen"), ms. */
    maxStillMs: 7000,
    /** Stuck this close to the final waypoint counts as arrived (tiles). */
    closeEnough: 1.2,
    /** Trying to walk but not moving for this long → pick a new path, ms. */
    stuckMs: 1500,
    /** Leaving: chance to use the nearest entry (else a random one). */
    leaveNearest: 0.6,
  },
  /**
   * TF2-fix-1 (C1 note: NPCs were "much more confident" than players): shoppers who aren't sure of
   * themselves, so a player's stopping and turning looks like everyone else's. Each NPC rolls a
   * `doubt` in [0, 1] at spawn (halved when hurried); every `[lo, hi]` pair below is the range that
   * doubt maps across, so the crowd isn't uniform. Rates are per minute of walking (on a stall or roam
   * leg, at walking speed), applied as a per-tick chance. Target for the whole crowd (crowd script,
   * stops ≥ 0.2 s, turns > 90° within 4 s): mid-walk stops 4–7 per NPC-minute at a mean 0.8–1.5 s,
   * sharp turns 3–6 per NPC-minute.
   */
  doubt: {
    /** Hurried shoppers (§6.10 gaits) are surer of themselves: their doubt is scaled by this. */
    hurried: 0.5,
    /** Hesitation stop: how often, how long (ms), and how many look-left/right head turns. */
    stopPerMin: [1, 3.5] as const,
    stopMs: [400, 2000] as const,
    looks: [1, 3] as const,
    /** A look turns this far off the way it was heading (radians), one every `lookMs`. */
    lookTurn: [0.6, 1.5] as const,
    lookMs: [300, 700] as const,
    /** Share of hesitation stops that end by turning right round (stop, look, go back). */
    stopTurn: 0.25,
    /** Facing turns toward where it is looking at this rate while standing, radians/s. */
    turnRate: 7,
    /** The pause before choosing a direction (technique 5) looks around this often. */
    pauseLooks: 0.6,
    /** Change of mind: how often; share that turns right round (else picks a different target). */
    mindPerMin: [1.5, 5] as const,
    reverse: 0.55,
    /** A reversal stops and turns (ms), then walks this far back (tiles) before going on. */
    reverseTurnMs: [250, 600] as const,
    reverseDist: [1.5, 3.5] as const,
    /** A retarget swaps the next two wish-list stops this often (then re-picks); otherwise it heads
     *  off this far (tiles) at this angle off its heading (radians) before going on. */
    swap: 0.4,
    asideDist: [1.5, 4] as const,
    asideTurn: [1.7, 2.8] as const,
    /** Passing an open stall (within `npc.detourRadius`): chance to slow and drift toward it. */
    stallSlow: [0.35, 0.8] as const,
    /** Speed multiplier while drifting past a stall, and for how long (ms). */
    stallFactor: [0.45, 0.75] as const,
    stallMs: [1000, 2200] as const,
    /** Steering lean toward the stall's counter while slowed past it (seek weight is 1). */
    stallPull: 0.5,
    /** Share of those slow-downs that stop for a moment facing the stall, and how long (ms). */
    stallStop: 0.25,
    stallStopMs: [500, 1500] as const,
    /** Drift (technique 2): a low-frequency heading offset, up to this many radians either way… */
    drift: [0.15, 0.5] as const,
    /** …re-aimed every `driftMs`, eased toward at `driftEase` per second… */
    driftMs: [1500, 4000] as const,
    driftEase: 1.2,
    /** …and faded out within this distance of the waypoint so it still arrives (tiles). */
    driftFade: 2.5,
  },
  churn: {
    /** After the stream-in, a missing NPC is replaced after a random delay in this range, ms. */
    arrivalMs: [300, 2500] as const,
    /** Spawned NPCs are spread this far along the entry's lane edge (± tiles in y). */
    spawnSpreadY: 1.2,
  },
  /** Players' opening positions: at least this far apart and from blockers (tiles). */
  startGap: 2,
} as const;
