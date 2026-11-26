// The match as a pure state machine (SPEC §6.2, §6.14, §6.15, §6.18, §6.19, §12.3): lobby → rules (first
// Start only) → round start → play → hands up → reveal → transition, three times, → podium → lobby with
// the same players. Events in, effects out: the host wiring (TF12) turns effects into relay messages,
// round sims and TV renders. Time comes from the `now` option, randomness from the `rng` option, so the
// machine runs headless. Mid-round joins, disconnect takeover and the guard rush are TF16's.
import {
  openRulesOverview,
  rngStream,
  stepRulesOverview,
  type Rng,
  type RulesOverviewState,
  type RulesSource,
} from '@pcg/game-kit';
import { minPlayers } from '../../../game.meta';
import { CONTENT } from '../../content';
import type { Content, Outfit } from '../../content/types';
import {
  cleanName,
  MAX_PLAYERS,
  type LeaderAction,
  type LobbyPlayer,
  type PackItem,
  type Screen,
} from '../../shared/messages';
import { PLAYER_COLOR_IDS, type PlayerColorId } from '../../shared/theme';
import { resolveLeader } from '../party';
import { assignOutfit, OUTFIT_STREAM } from '../sim/outfits';
import type { RevealView } from '../sim/snapshot';
import type { EntityId, PlayerId, RoundStart } from '../sim/types';
import type { TvControl, TvView } from '../ui/types';
import { pickOpenStalls } from './openStalls';
import { matchTotals, revealOrder, topEarners } from './results';
import { MATCH_TUNING, type MatchTuning } from './tuning';
import type { MatchPlayer, MatchState, MatchTotal, RoundHaul, RoundResult } from './types';

export interface MatchOptions {
  /** Draws each match's seed (open stalls and round seeds derive from it). */
  rng: Rng;
  /** Host ms (outside the sim). Phase deadlines compare against it on `tick`. */
  now: () => number;
  content?: Content;
  /** How to play card count (SPEC §6.19); TF15's cards. */
  rulesCards?: number;
  /** The podium's feedback QR target (PLATFORM decision #11). */
  feedbackUrl?: string;
  tuning?: Partial<MatchTuning>;
}

export type MatchEvent =
  /** A phone's name step, or its rejoin handshake (SPEC §6.18). */
  | { type: 'join'; id: PlayerId; name: string }
  | { type: 'color'; id: PlayerId; color: PlayerColorId }
  | { type: 'ready'; id: PlayerId; ready: boolean }
  /** A phone's leader button; ignored from anyone but the leader. */
  | { type: 'leader'; id: PlayerId; action: LeaderAction }
  /** The TV's keyboard or gamepad (SPEC §6.16): acts for the leader. */
  | { type: 'control'; action: TvControl }
  | { type: 'disconnect'; id: PlayerId }
  | { type: 'reconnect'; id: PlayerId }
  /** Leave game: full removal (SPEC §6.18). */
  | { type: 'leave'; id: PlayerId }
  | { type: 'room'; code: string | null; joinUrl: string | null }
  /** The round's ledger results at hands up, with each player's character for the reveal cards. */
  | {
      type: 'hauls';
      round: number;
      hauls: RoundHaul[];
      characters: Readonly<Record<PlayerId, EntityId>>;
    }
  /** Advances phase deadlines against `now()`. */
  | { type: 'tick' };

export type Effect =
  /** `tvView()` changed. */
  | { k: 'tv' }
  /** Send this screen to this phone. */
  | { k: 'screen'; to: PlayerId; screen: Screen }
  /** Create the round sim; `outfits` are the ones the sim draws (same stream, same order). */
  | { k: 'roundStart'; start: RoundStart; outfits: Record<PlayerId, Outfit> }
  /** The opening is over; the round timer runs. */
  | { k: 'play'; round: number }
  /** Time up: freeze controls and answer with a `hauls` event (SPEC §6.14). */
  | { k: 'handsUp'; round: number }
  | { k: 'reveal'; round: number }
  /** Round transition (guard rush, fade); the round sim ends with it. */
  | { k: 'transition'; round: number }
  | { k: 'podium'; totals: MatchTotal[] }
  /** Back in the lobby (Play again, or the end of a lobby How to play). */
  | { k: 'lobby' }
  | { k: 'left'; id: PlayerId };

export interface Match {
  dispatch(event: MatchEvent): Effect[];
  tvView(): TvView;
  /** The screen for this phone now, or null if it isn't in the match. */
  screenFor(id: PlayerId): Screen | null;
  state(): MatchState;
}

/** Podium steps: 4th+ row, 3rd, 2nd, 1st (BUILD_PLAN §8 [TF6]). */
const PODIUM_LAST_STEP = 3;
const SEED_MAX = 0x7fffffff;

export function createMatch(opts: MatchOptions): Match {
  const content = opts.content ?? CONTENT;
  const b = content.balance;
  const tune: MatchTuning = { ...MATCH_TUNING, ...opts.tuning };
  const rulesCards = opts.rulesCards ?? tune.rulesCards;
  const feedbackUrl = opts.feedbackUrl ?? '';
  const itemNames = new Map(content.items.map((i) => [i.id, i.name]));

  const st: MatchState = {
    phase: 'lobby',
    round: 0,
    rounds: b.match.rounds,
    seed: 0,
    players: [],
    openStalls: [],
    results: [],
    rulesCard: 0,
    phaseEndsAt: null,
  };
  let leaderId: PlayerId | null = null;
  let rules: RulesOverviewState | null = null;
  let rulesShownOnStart = false;
  let room: { code: string | null; joinUrl: string | null } = { code: null, joinUrl: null };
  let outfits: Record<PlayerId, Outfit> = {};
  let haulsIn = false;
  let reveal: RevealView | null = null;
  let revealStep = 0;
  let podiumStep = 0;
  let totals: MatchTotal[] = [];

  const now = () => opts.now();
  const find = (id: PlayerId) => st.players.find((p) => p.id === id);
  const active = () => st.players.filter((p) => !p.waiting);
  const endsIn = () => (st.phaseEndsAt === null ? 0 : Math.max(0, Math.round(st.phaseEndsAt - now())));

  function syncLeader(): void {
    leaderId = resolveLeader(leaderId, st.players);
    for (const p of st.players) p.leader = p.id === leaderId;
  }

  function canStart(): boolean {
    if (st.phase !== 'lobby' || leaderId === null) return false;
    return st.players.filter((p) => p.connected && p.ready).length >= minPlayers;
  }

  const screens = (): Effect[] =>
    st.players.map((p) => ({ k: 'screen', to: p.id, screen: screenFor(p.id)! }));
  const screenTo = (id: PlayerId): Effect[] => [{ k: 'screen', to: id, screen: screenFor(id)! }];
  const everyone = (...first: Effect[]): Effect[] => [...first, { k: 'tv' }, ...screens()];
  const inLobbyish = () => st.phase === 'lobby' || st.phase === 'rules';

  // ---- phases --------------------------------------------------------------------------------

  function enterRules(source: RulesSource): Effect[] {
    rules = openRulesOverview(source, rulesCards);
    st.phase = 'rules';
    st.rulesCard = 0;
    st.phaseEndsAt = null;
    return everyone();
  }

  function enterLobby(): Effect[] {
    rules = null;
    st.phase = 'lobby';
    st.rulesCard = 0;
    st.phaseEndsAt = null;
    return everyone({ k: 'lobby' });
  }

  function enterRoundStart(round: number): Effect[] {
    for (const p of st.players) if (p.waiting && p.joinedRound <= round) p.waiting = false;
    const players = active();
    if (round === 1) {
      st.results = [];
      st.openStalls = pickOpenStalls(st.seed, players.length, content.layout, b);
    }
    st.phase = 'roundStart';
    st.round = round;
    rules = null;
    haulsIn = false;
    reveal = null;
    const seed = rngStream(st.seed, `round:${round}`).int(0, SEED_MAX);
    const g = b.guards.start;
    const table = players.length >= g.largeFrom ? g.large : g.small;
    const start: RoundStart = {
      seed,
      round,
      players: players.map((p) => ({ id: p.id, side: { ...p.side } })),
      openStalls: [...st.openStalls],
      guards: table[Math.min(round, table.length) - 1]!,
    };
    // Same stream and order as the sim's player outfits (sim/world.ts), so the phone card matches.
    const rng = rngStream(seed, OUTFIT_STREAM);
    outfits = {};
    for (const p of players) outfits[p.id] = assignOutfit(rng, b.outfit);
    st.phaseEndsAt = now() + b.match.openingMs;
    return everyone({ k: 'roundStart', start, outfits: { ...outfits } });
  }

  function enterPlay(): Effect[] {
    st.phase = 'play';
    st.phaseEndsAt = now() + b.match.roundMs;
    return everyone({ k: 'play', round: st.round });
  }

  function enterHandsUp(): Effect[] {
    st.phase = 'handsUp';
    st.phaseEndsAt = now() + tune.handsUpMs;
    // Phones get their tiles when the `hauls` event brings them.
    return [{ k: 'handsUp', round: st.round }, { k: 'tv' }];
  }

  function enterReveal(): Effect[] {
    st.phase = 'reveal';
    revealStep = Math.min(1, reveal?.entries.length ?? 0);
    st.phaseEndsAt = now() + revealBeat();
    return [{ k: 'reveal', round: st.round }, { k: 'tv' }];
  }

  const revealBeat = () =>
    revealStep < (reveal?.entries.length ?? 0) ? tune.revealCardMs : tune.revealCrownMs;

  function enterTransition(): Effect[] {
    st.phase = 'transition';
    st.phaseEndsAt = now() + tune.transitionMs;
    return [{ k: 'transition', round: st.round }, { k: 'tv' }];
  }

  function enterPodium(): Effect[] {
    const played = st.players.filter((p) =>
      st.results.some((r) => r.hauls.some((h) => h.side.id === p.side.id)),
    );
    totals = matchTotals(
      st.results,
      played.map((p) => p.side),
    );
    st.phase = 'podium';
    podiumStep = 0;
    st.phaseEndsAt = now() + tune.podiumStepMs;
    return everyone({ k: 'podium', totals: totals.map((t) => ({ ...t })) });
  }

  function playAgain(): Effect[] {
    st.round = 0;
    st.seed = 0;
    st.results = [];
    st.openStalls = [];
    totals = [];
    for (const p of st.players) {
      p.ready = false;
      p.waiting = false;
      p.joinedRound = 0;
    }
    return enterLobby();
  }

  function tick(): Effect[] {
    if (st.phaseEndsAt === null || now() < st.phaseEndsAt) return [];
    switch (st.phase) {
      case 'roundStart':
        return enterPlay();
      case 'play':
        return enterHandsUp();
      case 'handsUp':
        return haulsIn ? enterReveal() : [];
      case 'reveal':
        if (revealStep < (reveal?.entries.length ?? 0)) {
          revealStep += 1;
          st.phaseEndsAt = now() + revealBeat();
          return [{ k: 'tv' }];
        }
        return enterTransition();
      case 'transition':
        return st.round < st.rounds ? enterRoundStart(st.round + 1) : enterPodium();
      case 'podium':
        podiumStep += 1;
        st.phaseEndsAt = podiumStep >= PODIUM_LAST_STEP ? null : now() + tune.podiumStepMs;
        return [{ k: 'tv' }];
      default:
        return [];
    }
  }

  function control(action: TvControl): Effect[] {
    switch (st.phase) {
      case 'lobby':
        if (action === 'rules') return enterRules('lobby');
        if (action !== 'start' || !canStart()) return [];
        st.seed = opts.rng.int(1, SEED_MAX);
        if (!rulesShownOnStart) {
          rulesShownOnStart = true;
          return enterRules('firstStart');
        }
        return enterRoundStart(1);
      case 'rules': {
        if ((action !== 'next' && action !== 'skip') || !rules) return [];
        const res = stepRulesOverview(rules, action);
        if (!res.done) {
          rules = res.state;
          st.rulesCard = res.state.card;
          return everyone();
        }
        return res.source === 'firstStart' ? enterRoundStart(1) : enterLobby();
      }
      case 'podium':
        return action === 'playAgain' ? playAgain() : [];
      default:
        return [];
    }
  }

  function onHauls(round: number, hauls: RoundHaul[], chars: Readonly<Record<PlayerId, EntityId>>) {
    if (st.phase !== 'handsUp' || round !== st.round || haulsIn) return [];
    haulsIn = true;
    const result: RoundResult = { round, hauls: hauls.map((h) => ({ ...h, items: [...h.items] })) };
    st.results.push(result);
    const shown = revealOrder(result.hauls).filter((h) => {
      const p = find(h.side.id);
      return p !== undefined && chars[p.id] !== undefined;
    });
    const tops = new Set(topEarners(shown).map((s) => s.id));
    reveal = {
      round,
      entries: shown.map((h) => {
        const p = find(h.side.id)!;
        return {
          character: chars[p.id]!,
          name: p.name,
          color: p.color,
          bag: h.bag,
          items: h.items.map((i) => ({ item: i.item, value: i.value })),
          haul: h.haul,
          top: tops.has(p.id),
        };
      }),
    };
    return everyone();
  }

  // ---- party events --------------------------------------------------------------------------

  function join(id: PlayerId, rawName: string): Effect[] {
    const name = cleanName(rawName);
    if (!name) return [];
    const existing = find(id);
    if (existing) {
      existing.name = name;
      existing.connected = true;
      syncLeader();
      return inLobbyish() || st.phase === 'podium' ? everyone() : screenTo(id);
    }
    if (st.players.length >= MAX_PLAYERS) {
      return [{ k: 'screen', to: id, screen: { s: 'waiting', reason: 'full' } }];
    }
    const used = new Set(st.players.map((p) => p.color));
    const lobbyish = inLobbyish();
    st.players.push({
      id,
      side: { kind: 'player', id },
      name,
      color: PLAYER_COLOR_IDS.find((c) => !used.has(c)) ?? PLAYER_COLOR_IDS[0],
      ready: false,
      leader: false,
      connected: true,
      // Joins after Start wait for the next round start (SPEC §6.18); TF16 adds the mid-round walk-on.
      joinedRound: lobbyish ? 0 : st.round + 1,
      waiting: !lobbyish,
    });
    syncLeader();
    return lobbyish ? everyone() : [{ k: 'tv' }, ...screenTo(id)];
  }

  function setConnected(id: PlayerId, connected: boolean): Effect[] {
    const p = find(id);
    if (!p || p.connected === connected) return [];
    p.connected = connected;
    syncLeader();
    return everyone();
  }

  function leave(id: PlayerId): Effect[] {
    const i = st.players.findIndex((p) => p.id === id);
    if (i < 0) return [];
    st.players.splice(i, 1);
    delete outfits[id];
    totals = totals.filter((t) => t.side.id !== id);
    syncLeader();
    return everyone({ k: 'left', id });
  }

  function dispatch(e: MatchEvent): Effect[] {
    switch (e.type) {
      case 'join':
        return join(e.id, e.name);
      case 'color': {
        const p = find(e.id);
        if (st.phase !== 'lobby' || !p || p.color === e.color) return [];
        if (!PLAYER_COLOR_IDS.includes(e.color)) return [];
        if (st.players.some((q) => q !== p && q.color === e.color)) return [];
        p.color = e.color;
        return everyone();
      }
      case 'ready': {
        const p = find(e.id);
        if (st.phase !== 'lobby' || !p || p.ready === e.ready) return [];
        p.ready = e.ready;
        return everyone();
      }
      case 'leader':
        if (e.id !== leaderId) return [];
        return control(e.action === 'howToPlay' ? 'rules' : e.action);
      case 'control':
        return control(e.action);
      case 'disconnect':
        return setConnected(e.id, false);
      case 'reconnect':
        return setConnected(e.id, true);
      case 'leave':
        return leave(e.id);
      case 'room':
        room = { code: e.code, joinUrl: e.joinUrl };
        return [{ k: 'tv' }];
      case 'hauls':
        return onHauls(e.round, e.hauls, e.characters);
      case 'tick':
        return tick();
      default:
        return [];
    }
  }

  // ---- views ---------------------------------------------------------------------------------

  function handsUpScreen(p: MatchPlayer): Screen {
    const h = st.results.find((r) => r.round === st.round)?.hauls.find((x) => x.side.id === p.id);
    if (!h) return { s: 'handsUp', bag: 0, items: [], total: 0 };
    const items: PackItem[] = h.items.map((i) => ({
      item: i.item,
      name: itemNames.get(i.item) ?? i.item,
      value: i.value,
      weight: i.weight,
    }));
    return { s: 'handsUp', bag: h.bag, items, total: h.haul };
  }

  function screenFor(id: PlayerId): Screen | null {
    const p = find(id);
    if (!p) return null;
    const leader = p.id === leaderId;
    if (p.waiting) return { s: 'waiting', reason: 'nextRound' };
    switch (st.phase) {
      case 'lobby': {
        const players: LobbyPlayer[] = st.players.map((q) => ({
          name: q.name,
          color: q.color,
          ready: q.ready,
          leader: q.leader,
          connected: q.connected,
        }));
        const you = st.players.indexOf(p);
        return { s: 'lobby', players, you, canStart: leader && canStart() };
      }
      case 'rules':
        return { s: 'rules', card: st.rulesCard, count: rulesCards, leader };
      case 'roundStart': {
        const outfit = outfits[p.id];
        // A player kept out of this round (joined after it was set up) waits for the next one.
        if (!outfit) return { s: 'waiting', reason: 'nextRound' };
        return {
          s: 'roundStart',
          round: st.round,
          rounds: st.rounds,
          outfits: [outfit],
          endsInMs: endsIn(),
        };
      }
      case 'play':
        if (!outfits[p.id]) return { s: 'waiting', reason: 'nextRound' };
        return {
          s: 'play',
          round: st.round,
          rounds: st.rounds,
          endsInMs: endsIn(),
          name: p.name,
          color: p.color,
        };
      case 'handsUp':
      case 'reveal':
      case 'transition':
        return handsUpScreen(p);
      case 'podium': {
        const t = totals.find((x) => x.side.id === p.id);
        if (!t) return { s: 'waiting', reason: 'nextRound' };
        return { s: 'matchEnd', place: t.place, total: t.total, tied: t.tied, leader };
      }
    }
  }

  function tvView(): TvView {
    const { round, rounds } = st;
    switch (st.phase) {
      case 'lobby':
        return {
          phase: 'lobby',
          code: room.code,
          joinUrl: room.joinUrl,
          players: st.players.map((p) => ({
            name: p.name,
            color: p.color,
            ready: p.ready,
            leader: p.leader,
          })),
          canStart: canStart(),
        };
      case 'rules':
        return { phase: 'rules', card: st.rulesCard, count: rulesCards };
      case 'roundStart':
        return { phase: 'roundStart', round, rounds, endsInMs: endsIn() };
      // Nothing that identifies a player during a round (SPEC §6.11, §6.16).
      case 'play':
        return { phase: 'play', round, rounds, timeLeftMs: endsIn(), code: room.code };
      case 'handsUp':
        return { phase: 'handsUp', round, rounds };
      case 'reveal':
        return {
          phase: 'reveal',
          reveal: reveal ?? { round, entries: [] },
          step: revealStep,
        };
      case 'transition':
        return { phase: 'transition', round, rounds };
      case 'podium':
        return {
          phase: 'podium',
          rows: totals.map((t) => {
            const p = find(t.side.id)!;
            return { name: p.name, color: p.color, total: t.total, place: t.place };
          }),
          feedbackUrl,
          step: podiumStep,
        };
    }
  }

  const state = (): MatchState => structuredClone(st);

  return { dispatch, tvView, screenFor, state };
}
