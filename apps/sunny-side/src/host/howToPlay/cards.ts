// How to play cards (SPEC §6.9): final copy, one idea per card, and each card's illustration script.
// DASH is hidden (decision #31): no card mentions or shows it. Frozen at H0 (how-to-play): additive only.
import type { RulesCard, RulesIllustration } from '@pcg/game-kit';
import { targetScoreFor } from '../match/scoring';
import { card1Script } from './card1';
import { card2Script } from './card2';
import { card3Script } from './card3';
import { card4Script } from './card4';
import { card5Script } from './card5';
import { card6Script } from './card6';
import type { IllustrationScript, IllustrationStage } from './types';

/** Card count (the `rules` screen's `cards`). */
export const RULES_CARD_COUNT = 6;

/** Seconds a knocked-off egg waits before its ghost spawns (sim `ghost.spawnDelayMs`; a test pins it). */
export const GHOST_DELAY_S = 4;
/** Seconds the pan stays full size before the edge heats (sim `arena.holdMs`; a test pins it). */
export const SHRINK_HOLD_S = 10;

/** Card text without illustrations (tests and docs; the phone never needs it). */
export const CARD_COPY: readonly Omit<RulesCard, 'illustration'>[] = [
  {
    title: 'Last egg on the pan',
    body: 'Shove the other eggs off the pan. The last egg left wins the round.',
  },
  {
    title: 'Steer with your thumb',
    body: 'Drag anywhere on the left side of your phone to slide your egg. Keep your eyes on the TV.',
  },
  {
    title: 'Hold SLAM, then let go',
    body: "Hold SLAM to charge, release to belly-flop. The longer you charge, the harder you hit, but you're slow while charging.",
  },
  {
    title: 'The pan is heating up',
    body: `About ${SHRINK_HOLD_S} seconds in, the edge starts sizzling inward. The pan only gets smaller.`,
  },
  {
    title: 'Scoring',
    body: ({ playerCount }) =>
      `Knock an egg off: +1. Last egg standing: +3. First to ${targetScoreFor(playerCount)} wins.`,
    note: 'Fall off on your own and nobody scores.',
  },
  {
    title: 'Come back as a ghost',
    body: `Knocked off? In ${GHOST_DELAY_S} seconds you're back as steam. Tap PULSE to puff eggs toward the edge. Ghosts can't score, but revenge is free.`,
  },
];

/** Illustration scripts, in card order. */
export const CARD_SCRIPTS: readonly IllustrationScript[] = [
  card1Script,
  card2Script,
  card3Script,
  card4Script,
  card5Script,
  card6Script,
];

function onStage(stage: IllustrationStage, script: IllustrationScript): RulesIllustration {
  return { mount: (slot, opts) => stage.mount(script, slot, opts) };
}

/** The six cards for the kit's shell, drawing their illustrations on `stage`. */
export function rulesCards(stage: IllustrationStage): RulesCard[] {
  return CARD_COPY.map((copy, i) => ({ ...copy, illustration: onStage(stage, CARD_SCRIPTS[i]!) }));
}
