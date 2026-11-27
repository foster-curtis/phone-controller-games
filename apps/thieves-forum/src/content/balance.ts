// Balance sheet (SPEC §7, §12.4): every number that tunes Thieves' Forum lives in this one file: every
// SPEC §7 value (the "§7" comments) plus the build's own tuning numbers ("build value"). Units: times in
// ms (the sim converts them to ticks at load), distances in tiles (48 px wide), speeds in tiles/s, rates
// and shares as fractions, money in denarii. All are starting values for playtesting (SPEC §10.3).
// Names are fixed by ./types (frozen at TF0); values are never frozen.
import type { Balance } from './types';

export const balance = {
  match: {
    rounds: 3, // §7 Rounds per match
    roundMs: 270_000, // §7 Round length
    roundMsRange: [180_000, 300_000], // §7 Round length range
    openingMs: 4000, // §7 Players-only opening (§6.2)
    startPurse: 20, // §7 Starting purse, per round (§6.4)
    packCapacity: 15, // §7 Pack capacity (§6.4)
    roundStartMs: 4000, // build value: phone "THIS IS YOU" countdown matches the opening (§6.17)
  },
  luck: {
    skew: 2, // §7 Luck skew exponent (§6.4)
  },
  pawn: {
    rate: [0.45, 0.7], // §7 Pawnbroker rate, low-weighted (§6.4)
    rerollMs: 45_000, // §7 re-rolls every 45 s
  },
  npcSale: {
    rate: [1.1, 1.5], // §7 NPC sale rate, rolled per NPC at spawn (§6.4)
  },
  npcs: {
    base: 32 / 3, // §7 NPCs = round(32/3 + 8/3 × players): 2p → 16 … 8p → 32 (§6.10; user at C1)
    perPlayer: 8 / 3, // §7
    tolerance: 0.08, // §7 NPC count tolerance ±8% (§6.10)
    toleranceMin: 1, // §6.10 "rounded, at least ±1"
    purse: [20, 60], // build value: enough for a few cheap buys (§6.8 "enough for their shopping")
    wishList: [1, 3], // build value: "spices, then bread" (§6.10)
    personality: {
      speed: [0.85, 1.15], // build value (§6.10 technique 4)
      distractibility: [0.05, 0.35], // build value
      browseMs: [2000, 6000], // build value
      hurriedChance: 0.15, // build value (§6.10 gaits)
    },
    streamInMs: 4000, // build value: "over a few seconds" (§6.2)
    coinChaseChance: 0.2, // build value (§6.10 technique 5)
  },
  join: {
    handOffMs: 1500, // §7 Join hand-off delay (§6.18)
  },
  ambience: {
    oneShotMs: [2000, 6000], // §7 Ambience one-shot interval (§6.20)
    duckDb: -8, // §7 Ambience duck
    duckMs: 1000, // §7 for ~1 s
  },
  grab: {
    baseMs: 500, // §7 Grab time = 500 + 100 × weight + 2 × value (§6.5)
    perWeightMs: 100, // §7
    perValueMs: 2, // §7
    roundToMs: 50, // §7 nearest 50 ms
    reachPenaltyMs: 500, // §7 Back-shelf reach penalty (§6.7)
  },
  pickpocket: {
    holdMs: 2000, // §7 Pickpocket hold (§6.8)
    amount: [8, 20], // §7 Pickpocket amount, low-weighted
    reach: 1.1, // build value: about one body length behind
    behindDeg: 60, // build value: within 60° of the victim's back
  },
  tip: {
    fee: 10, // §7 Tip-off fee (§6.13)
    share: 0.25, // §7 Tipper's share ¼ of pot
    snapshotTtlMs: 20_000, // build value: a forgotten sheet can't land a late tip (§11 #28)
    snapshotW: 960, // build value (§12.6)
    snapshotH: 540, // build value
    jpegQuality: 0.6, // build value: target ≤ 60 KB
  },
  catch: {
    wrongGrabPenalty: 12, // §7 Wrong-grab penalty (§6.13)
    potShare: 0.25, // §7 Pot = 25% of bag, rounded down
    hotMs: 5000, // §7 Hot-hands window
    graceMs: 300, // §7 Catch grace
    reach: 1.2, // build value: "the character you're touching"
  },
  stocks: {
    ms: 20_000, // §7 Stocks time (§6.13)
    immunityMs: 3000, // §7 Post-stocks immunity
  },
  guards: {
    escapeMs: 3000, // §7 Escape (out of sight) (§6.12)
    start: { small: [1, 1, 2], large: [1, 2, 3], largeFrom: 5 }, // §7 Starting guards
    activationsPerGuard: 5, // §7 Activations per extra guard
    cap: 4, // §7 Guard cap
    alleySpeed: 0.6, // §7 Guard alley speed 60%
    walkSpeed: 1.6, // build value: patrol walk
    jogSpeed: 3.6, // build value: a little faster than a jogging player
    coneRange: 9, // build value
    coneHalfDeg: 30, // build value
    catchReach: 0.9, // build value
  },
  toss: {
    cost: 1, // §7 Coin toss cost (§6.9)
    cooldownMs: 8000, // §7 Coin toss cooldown
    range: 3, // build value: "a short distance ahead"
    flightMs: 900, // build value: "under 1 s"
    merchantRange: 7, // build value: "nearest merchant within range"
  },
  stalls: {
    openExtra: 4, // §7 Open stalls = players + 4 (§6.3; user at C1)
    openMin: 6, // §7 min 6
    openMax: 10, // §7 max 10
  },
  merchants: {
    suspicion: { glanceMult: 2, decayMs: 20_000 }, // §7 "Just browsing" suspicion (§6.6)
    glanceIntervalMs: [4000, 8000], // §7 Merchant base glance interval
    windupMs: 600, // build value: the half-turn warning beat (§6.6)
    lookMs: 900, // build value: the over-the-shoulder look
    bringForwardChance: 0.15, // build value (§6.6, §10.3)
    leaveOutChance: 0.5, // build value
    walkSpeed: 1.4, // build value
  },
  npcGlance: {
    chance: 0.25, // §7 NPC pickpocket glance chance (§6.8)
    robbedChance: 0.5, // build value: "higher if recently robbed"
    robbedMs: 30_000, // build value: "for a while"
    windupMs: 500, // build value: head-turn wind-up
    lookMs: 800, // build value
  },
  stock: {
    raresPerStall: 1, // §7 Rare stock ~1 per stall per round, no restock (§6.5)
    uncommonRestockMs: 60_000, // §7 Uncommon restock "slow (e.g. 60 s)"
    commonRestockMs: 8000, // build value: "common = always restocks"
  },
  movement: {
    shuffle: 0.6, // build value: slowest stick speed
    walk: 1.5, // build value: NPC walk
    brisk: 2.0, // build value: hurried NPC
    jog: 3.2, // build value: full tilt, "noticeably faster than any NPC" (§6.10)
    run: 4.0, // build value: end-of-round flight (§6.14)
    bodyRadius: 0.35, // build value
    jogFrom: 0.85, // build value: stick magnitude where the jog starts
  },
  crowd: {
    seek: 1, // build value (§6.10 technique 2)
    wander: 0.35, // build value
    separation: 1.4, // build value
    separationRadius: 0.9, // build value
  },
  net: {
    inputStaleMs: 250, // build value (§12.5, PLATFORM §3)
    holdStaleMs: 500, // build value: hold bit reads released after this
  },
  outfit: {
    tunics: ['linen', 'umber', 'terracotta', 'madder', 'olive', 'sage', 'woad', 'mulberry'], // §6.0
    mantles: ['linen', 'umber', 'terracotta', 'madder', 'olive', 'sage', 'woad', 'mulberry'], // §6.0
    hairTones: 5, // build value (§12.4: tone table in the renderer)
    skinTones: 5, // build value
  },
} satisfies Balance;
