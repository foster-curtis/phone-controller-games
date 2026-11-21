// Phone ↔ host game messages, carried in the relay's `send.data` (SPEC §15.6). Shared by the phones
// and the TV; imports nothing but ids.
// Frozen after RD2 (REDESIGN_BUILD_PLAN §3): additive changes only (new optional fields, new union
// members, new guard cases). A breaking change bumps PROTOCOL_VERSION and is logged in SPEC §15.11.
// RD2 implemented the v2 shapes: InputTuple v2 (build aim and fires; the build-arc fields are gone),
// Intent without `build`/`give`, AckReason without the supply reason, RunStats with `buildsPlaced`,
// MeView with `build: MeBuild`.
import {
  ACT_ICON_IDS,
  BUILD_IDS,
  CARD_IDS,
  CLASS_IDS,
  DIFFICULTY_IDS,
  ENEMY_IDS,
  PLAYER_COLOR_IDS,
  SHOP_ITEM_IDS,
  isOneOf,
  type ActIconId,
  type BuildId,
  type CardId,
  type ClassId,
  type DifficultyId,
  type EnemyId,
  type PlayerColorId,
  type ShopItemId,
} from './ids';

export const GAME_ID = 'fort-frenzy';
export const PROTOCOL_VERSION = 2; // 2: the redesign's wire (RD1 ids, RD2 tuple v2 and views); stays 2 through RD14 (plan §8)

/** Name limit for the `name` intent (SPEC §15.6), in code points. */
export const NAME_MAX = 10;

// ---- phone → host -------------------------------------------------------------------------------

/** Input tuple length; `isInputTuple` checks it. */
export const INPUT_TUPLE_LENGTH = 12;

/** `InputTuple[8]` bits. */
export const INPUT_FLAG_MAIN_AIMING = 1;
export const INPUT_FLAG_SUPER_AIMING = 2;
export const INPUT_FLAG_BUILD_AIMING = 4;

/**
 * Aimed-button dead zone (the center grace zone) as a fraction of the aim clamp; the phone passes it
 * to the kit's aimed gesture (FF7-fix-5, C4: 25%, widened from the kit's 12% for a thumb). A release
 * inside it cancels, so the TV hides the aim line while a held aim is inside and shows it again once
 * the aim is back out (SPEC §10.1, §15.7).
 */
export const AIM_DEAD_ZONE = 0.25;

/**
 * Phone → host input v2 (SPEC §10.1, §11.4). Sticks and aims are ints −100..100, dead zone applied on
 * the phone. Counters only grow (a reload restarts them; the host re-baselines, §15.3).
 */
export type InputTuple = [
  moveX: number,
  moveY: number,
  /** Live aim while aiming, the release aim with a fire; 0,0 with a fire = tap = auto-aim. */
  mainX: number,
  mainY: number,
  superX: number,
  superY: number,
  /** Thrown builds: live aim, the release aim; 0,0 = tap (the knight's feet). */
  buildX: number,
  buildY: number,
  /** INPUT_FLAG_*: 1 main aiming, 2 super aiming, 4 build aiming. */
  flags: number,
  mainFires: number,
  superFires: number,
  buildFires: number,
];

export type Intent =
  | { k: 'name'; name: string } // ≤ NAME_MAX code points; color is auto-assigned
  | { k: 'class'; classId: ClassId } // the knight (knight select)
  | { k: 'ready'; ready: boolean }
  | { k: 'color'; color: PlayerColorId } // lobby only; host validates, acks (`taken`)
  | { k: 'leader'; action: 'start' | 'resume' | 'newRun' }
  | { k: 'leader'; action: 'difficulty'; difficulty: DifficultyId }
  | { k: 'leader'; action: 'remove'; playerId: string } // lobby only
  | { k: 'leader'; action: 'end'; option: 'again' | 'classes' | 'home' } // 'classes' = Change Knight
  | { k: 'buy'; item: ShopItemId }
  | { k: 'request'; item: ShopItemId; on: boolean }
  | { k: 'card'; card: CardId } // Confirm on the card pop-up (§10.2)
  | { k: 'claim'; slot: number } // resume into a new room
  | { k: 'pause'; paused: boolean }; // team pause from any run phone (C4, FF14-fix-1)

export type IntentKind = Intent['k'];

export type ControllerMsg =
  | InputTuple
  | { t: 'hello'; proto: number; deviceId: string }
  | { t: 'intent'; seq: number; intent: Intent };

// ---- host → phone -------------------------------------------------------------------------------

/** `cap`: the shop item is at its max tier (#96). */
export type AckReason = 'coins' | 'cap' | 'phase' | 'invalid' | 'notLeader' | 'taken';
export const ACK_REASONS = [
  'coins',
  'cap',
  'phase',
  'invalid',
  'notLeader',
  'taken',
] as const satisfies readonly AckReason[];

/** Per-player run stats (summary screen, SPEC §4; kept in the resume snapshot, §15.8). */
export interface RunStats {
  /** Own, squad and builds. */
  damageDealt: number;
  bossDamage: number;
  kills: number;
  damageTaken: number;
  deaths: number;
  /** Super, beacon and Field Medic healing (not regen). */
  healingDone: number;
  buildsPlaced: number;
}
export const RUN_STAT_KEYS = [
  'damageDealt',
  'bossDamage',
  'kills',
  'damageTaken',
  'deaths',
  'healingDone',
  'buildsPlaced',
] as const satisfies readonly (keyof RunStats)[];

/** End of run (SPEC §4): waves survived and one award card per player. */
export interface RunSummary {
  result: 'victory' | 'defeat';
  wavesSurvived: number;
  durationMs: number;
  players: {
    playerId: string;
    name: string;
    color: PlayerColorId;
    classId: ClassId;
    stats: RunStats;
    /** The stat this player's award card celebrates, or null. */
    award: keyof RunStats | null;
  }[];
}

export type TeamPhase = 'lobby' | 'countdown' | 'build' | 'combat' | 'summary' | 'restoring';
export const TEAM_PHASES = [
  'lobby',
  'countdown',
  'build',
  'combat',
  'summary',
  'restoring',
] as const satisfies readonly TeamPhase[];

export interface TeamRosterEntry {
  playerId: string;
  name: string;
  color: PlayerColorId;
  classId: ClassId | null;
  ready: boolean;
  connected: boolean;
}

export interface TeamShopRow {
  id: ShopItemId;
  tier: number;
  maxTier: number;
  /** null = sold out (max tier). */
  price: number | null;
  visible: boolean;
  holdToConfirm: boolean;
}

/** Who paused the run (C4 team pause, SPEC §10.5, FF14-fix-1). */
export interface TeamPause {
  playerId: string;
  name: string;
  color: PlayerColorId;
}

/** Team state every phone shows (SPEC §15.6). Full snapshot, broadcast on change, ≤ 5 Hz. */
export interface TeamView {
  phase: TeamPhase;
  wave: number;
  buildEndsInMs: number | null;
  coins: number;
  baseHp: number;
  baseMaxHp: number;
  difficulty: DifficultyId;
  leaderId: string | null;
  roster: TeamRosterEntry[];
  shop: TeamShopRow[];
  wishlist: { item: ShopItemId; by: string }[];
  /** Never the hot side (§4). */
  nextWave: { enemies: { id: EnemyId; count: number }[]; boss: boolean } | null;
  summary: RunSummary | null;
  /** A player paused the run (FF14-fix-1); absent or null = running. */
  paused?: TeamPause | null;
}

/** `build` shows the card pop-up until `cards.picked` is set, then the shop (§10.2). */
export type MeScreen =
  | 'name'
  | 'lobby'
  | 'waiting'
  | 'full'
  | 'combat'
  | 'build'
  | 'dead'
  | 'summary'
  | 'restoring'
  | 'claim';
export const ME_SCREENS = [
  'name',
  'lobby',
  'waiting',
  'full',
  'combat',
  'build',
  'dead',
  'summary',
  'restoring',
  'claim',
] as const satisfies readonly MeScreen[];

/** The build button (SPEC §10.1). */
export interface MeBuild {
  id: BuildId;
  /** The gesture now: 'tap' for at-feet builds and the Commander's recall, 'aimed' for thrown builds. */
  input: 'aimed' | 'tap';
  /** act-shield | act-mine | act-beacon | act-flag | act-recall. */
  icon: ActIconId;
  /** 0..1 ring. */
  meter: number;
  /** Steady amber ring, button lit. */
  full: boolean;
  /** What a release does now; 'none' = dimmed. */
  mode: 'place' | 'recall' | 'none';
  /** The knight's builds on the map (mines 0..maxActive). */
  active: number;
}
export const ME_BUILD_MODES = [
  'place',
  'recall',
  'none',
] as const satisfies readonly MeBuild['mode'][];

/** Class growth for the pop-up header (§6.1): "Wave 4 cleared: +HP +DMG". */
export interface MeGrowth {
  wave: number;
  boss: boolean;
  stats: ('maxHp' | 'damage' | 'healing')[];
}
export const GROWTH_STATS = [
  'maxHp',
  'damage',
  'healing',
] as const satisfies readonly MeGrowth['stats'][number][];

/** One phone's own state (SPEC §15.6). Full snapshot, per phone on change, ≤ 10 Hz. */
export interface MeView {
  screen: MeScreen;
  slot: number | null;
  name: string;
  color: PlayerColorId | null;
  classId: ClassId | null;
  isLeader: boolean;
  ready: boolean;
  hp: number;
  maxHp: number;
  /** 0..1 ring. */
  superCharge: number;
  /** Full state (§10.1). */
  superReady: boolean;
  /** Commander at the squad cap: dimmed, charge held. */
  superBlocked: boolean;
  /** null outside a run. */
  build: MeBuild | null;
  respawnMs: number | null;
  /**
   * The pop-up (§10.2): selection is phone-local; Confirm sends `card`. `offer` null = no pop-up
   * (after a pick, or none dealt); `picked` set = show the shop.
   */
  cards: {
    offer: CardId[] | null;
    picked: CardId | null;
    owned: { id: CardId; n: number }[];
    growth: MeGrowth | null;
  };
  claim: { slot: number; name: string; classId: ClassId }[] | null;
}

export type HostMsg =
  | { t: 'team'; rev: number; team: TeamView } // broadcast on change, ≤ 5 Hz
  | { t: 'me'; rev: number; me: MeView } // per phone on change, ≤ 10 Hz
  | { t: 'ack'; seq: number; ok: boolean; reason?: AckReason }
  | { t: 'outdated'; proto: number };

// ---- runtime guards -----------------------------------------------------------------------------
// The relay forwards any JSON, so both sides check what they receive. Guards check shape, enums and
// ranges; game rules (is this item affordable?) are the host's job and answer with `ack`.

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v: unknown): v is number => Number.isInteger(v);
const isNat = (v: unknown): v is number => isInt(v) && v >= 0;
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isBool = (v: unknown): v is boolean => typeof v === 'boolean';
const isStr = (v: unknown): v is string => typeof v === 'string';
const inRange = (v: unknown, lo: number, hi: number) => isInt(v) && v >= lo && v <= hi;
const orNull =
  <T>(g: (v: unknown) => v is T) =>
  (v: unknown): v is T | null =>
    v === null || g(v);
const arrayOf = <T>(v: unknown, g: (x: unknown) => x is T): v is T[] =>
  Array.isArray(v) && v.every((x) => g(x));
const oneOf =
  <T extends string>(ids: readonly T[]) =>
  (v: unknown): v is T =>
    isOneOf(ids, v);

const isClassId = oneOf(CLASS_IDS);
const isEnemyId = oneOf(ENEMY_IDS);
const isShopItemId = oneOf(SHOP_ITEM_IDS);
const isCardId = oneOf(CARD_IDS);
const isDifficultyId = oneOf(DIFFICULTY_IDS);
const isColorId = oneOf(PLAYER_COLOR_IDS);

/** Length 12; [0..7] ints in −100..100; [8] int in 0..7; [9..11] naturals. */
export function isInputTuple(v: unknown): v is InputTuple {
  if (!Array.isArray(v) || v.length !== INPUT_TUPLE_LENGTH) return false;
  for (let i = 0; i < 8; i++) if (!inRange(v[i], -100, 100)) return false;
  return inRange(v[8], 0, 7) && v.slice(9, 12).every(isNat);
}

export function isIntent(v: unknown): v is Intent {
  if (!isObj(v)) return false;
  switch (v.k) {
    case 'name':
      return isStr(v.name) && [...v.name].length <= NAME_MAX;
    case 'class':
      return isClassId(v.classId);
    case 'ready':
      return isBool(v.ready);
    case 'color':
      return isColorId(v.color);
    case 'leader':
      switch (v.action) {
        case 'start':
        case 'resume':
        case 'newRun':
          return true;
        case 'difficulty':
          return isDifficultyId(v.difficulty);
        case 'remove':
          return isStr(v.playerId) && v.playerId.length > 0;
        case 'end':
          return v.option === 'again' || v.option === 'classes' || v.option === 'home';
        default:
          return false;
      }
    case 'buy':
      return isShopItemId(v.item);
    case 'request':
      return isShopItemId(v.item) && isBool(v.on);
    case 'card':
      return isCardId(v.card);
    case 'claim':
      return isNat(v.slot);
    case 'pause':
      return isBool(v.paused);
    default:
      return false;
  }
}

export function isControllerMsg(v: unknown): v is ControllerMsg {
  if (Array.isArray(v)) return isInputTuple(v);
  if (!isObj(v)) return false;
  switch (v.t) {
    case 'hello':
      return (
        isNat(v.proto) && isStr(v.deviceId) && v.deviceId.length > 0 && v.deviceId.length <= 64
      );
    case 'intent':
      return isNat(v.seq) && isIntent(v.intent);
    default:
      return false;
  }
}

function isRunStats(v: unknown): v is RunStats {
  return isObj(v) && RUN_STAT_KEYS.every((k) => isNum(v[k]));
}

function isRunSummary(v: unknown): v is RunSummary {
  return (
    isObj(v) &&
    (v.result === 'victory' || v.result === 'defeat') &&
    isNat(v.wavesSurvived) &&
    isNum(v.durationMs) &&
    arrayOf(
      v.players,
      (p): p is RunSummary['players'][number] =>
        isObj(p) &&
        isStr(p.playerId) &&
        isStr(p.name) &&
        isColorId(p.color) &&
        isClassId(p.classId) &&
        isRunStats(p.stats) &&
        (p.award === null || isOneOf(RUN_STAT_KEYS, p.award)),
    )
  );
}

const isRosterEntry = (r: unknown): r is TeamRosterEntry =>
  isObj(r) &&
  isStr(r.playerId) &&
  isStr(r.name) &&
  isColorId(r.color) &&
  orNull(isClassId)(r.classId) &&
  isBool(r.ready) &&
  isBool(r.connected);

const isShopRow = (r: unknown): r is TeamShopRow =>
  isObj(r) &&
  isShopItemId(r.id) &&
  isNat(r.tier) &&
  isNat(r.maxTier) &&
  orNull(isNum)(r.price) &&
  isBool(r.visible) &&
  isBool(r.holdToConfirm);

const isTeamPause = (p: unknown): p is TeamPause =>
  isObj(p) && isStr(p.playerId) && isStr(p.name) && isColorId(p.color);

export function isTeamView(v: unknown): v is TeamView {
  if (!isObj(v)) return false;
  const next = v.nextWave;
  return (
    isOneOf(TEAM_PHASES, v.phase) &&
    isNat(v.wave) &&
    orNull(isNum)(v.buildEndsInMs) &&
    isNum(v.coins) &&
    isNum(v.baseHp) &&
    isNum(v.baseMaxHp) &&
    isDifficultyId(v.difficulty) &&
    orNull(isStr)(v.leaderId) &&
    arrayOf(v.roster, isRosterEntry) &&
    arrayOf(v.shop, isShopRow) &&
    arrayOf(
      v.wishlist,
      (w): w is TeamView['wishlist'][number] => isObj(w) && isShopItemId(w.item) && isStr(w.by),
    ) &&
    (next === null ||
      (isObj(next) &&
        isBool(next.boss) &&
        arrayOf(
          next.enemies,
          (e): e is { id: EnemyId; count: number } => isObj(e) && isEnemyId(e.id) && isNat(e.count),
        ))) &&
    orNull(isRunSummary)(v.summary) &&
    (v.paused === undefined || orNull(isTeamPause)(v.paused))
  );
}

const isMeBuild = (b: unknown): b is MeBuild =>
  isObj(b) &&
  isOneOf(BUILD_IDS, b.id) &&
  (b.input === 'aimed' || b.input === 'tap') &&
  isOneOf(ACT_ICON_IDS, b.icon) &&
  isNum(b.meter) &&
  b.meter >= 0 &&
  b.meter <= 1 &&
  isBool(b.full) &&
  isOneOf(ME_BUILD_MODES, b.mode) &&
  isNat(b.active);

const isMeGrowth = (g: unknown): g is MeGrowth =>
  isObj(g) && isNat(g.wave) && isBool(g.boss) && arrayOf(g.stats, oneOf(GROWTH_STATS));

export function isMeView(v: unknown): v is MeView {
  if (!isObj(v)) return false;
  const { cards, build, claim } = v;
  return (
    isOneOf(ME_SCREENS, v.screen) &&
    orNull(isNat)(v.slot) &&
    isStr(v.name) &&
    orNull(isColorId)(v.color) &&
    orNull(isClassId)(v.classId) &&
    isBool(v.isLeader) &&
    isBool(v.ready) &&
    isNum(v.hp) &&
    isNum(v.maxHp) &&
    isNum(v.superCharge) &&
    isBool(v.superReady) &&
    isBool(v.superBlocked) &&
    orNull(isMeBuild)(build) &&
    orNull(isNum)(v.respawnMs) &&
    isObj(cards) &&
    (cards.offer === null || arrayOf(cards.offer, isCardId)) &&
    orNull(isCardId)(cards.picked) &&
    arrayOf(
      cards.owned,
      (o): o is { id: CardId; n: number } => isObj(o) && isCardId(o.id) && isNat(o.n),
    ) &&
    orNull(isMeGrowth)(cards.growth) &&
    (claim === null ||
      arrayOf(
        claim,
        (c): c is { slot: number; name: string; classId: ClassId } =>
          isObj(c) && isNat(c.slot) && isStr(c.name) && isClassId(c.classId),
      ))
  );
}

export function isHostMsg(v: unknown): v is HostMsg {
  if (!isObj(v)) return false;
  switch (v.t) {
    case 'team':
      return isNat(v.rev) && isTeamView(v.team);
    case 'me':
      return isNat(v.rev) && isMeView(v.me);
    case 'ack':
      return (
        isNat(v.seq) && isBool(v.ok) && (v.reason === undefined || isOneOf(ACK_REASONS, v.reason))
      );
    case 'outdated':
      return isNat(v.proto);
    default:
      return false;
  }
}
