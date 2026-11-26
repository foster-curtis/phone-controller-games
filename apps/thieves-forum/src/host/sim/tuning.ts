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
    pauseMs: [300, 900] as const,
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
    /** Technique 5 doubling back: chance per leg, and how far back it walks (tiles). */
    doubleBack: 0.08,
    doubleBackDist: 2.5,
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
  churn: {
    /** After the stream-in, a missing NPC is replaced after a random delay in this range, ms. */
    arrivalMs: [300, 2500] as const,
    /** Spawned NPCs are spread this far along the entry's lane edge (± tiles in y). */
    spawnSpreadY: 1.2,
  },
  /** Players' opening positions: at least this far apart and from blockers (tiles). */
  startGap: 2,
} as const;
