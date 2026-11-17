import { resolveRulesCard } from '@pcg/game-kit';
import { describe, expect, it } from 'vitest';
import { TARGET_SCORES, TARGET_SCORE_MANY } from '../../match/config';
import { SIM_CONFIG } from '../../sim/config';
import {
  CARD_COPY,
  CARD_SCRIPTS,
  GHOST_DELAY_S,
  RULES_CARD_COUNT,
  SHRINK_HOLD_S,
  rulesCards,
} from '../cards';
import { previewCardFromSearch, previewPlayersFromSearch } from '../preview';
import type { IllustrationStage } from '../types';

const stage: IllustrationStage = { mount: () => ({ destroy() {} }), destroy() {} };

describe('how to play cards', () => {
  it('six cards, one script each', () => {
    expect(CARD_COPY).toHaveLength(RULES_CARD_COUNT);
    expect(CARD_SCRIPTS).toHaveLength(RULES_CARD_COUNT);
    expect(rulesCards(stage)).toHaveLength(RULES_CARD_COUNT);
    expect(new Set(CARD_SCRIPTS.map((s) => s.id)).size).toBe(RULES_CARD_COUNT);
  });

  it('never mentions DASH (decision #31)', () => {
    for (const c of rulesCards(stage)) {
      const r = resolveRulesCard(c, { playerCount: 4 });
      expect(`${r.title} ${r.body} ${r.note ?? ''}`).not.toMatch(/dash/i);
    }
  });

  it('the scoring card names the live target for the player count', () => {
    const scoring = rulesCards(stage)[4]!;
    for (const n of [2, 3, 4, 5, 8]) {
      const target = TARGET_SCORES[n] ?? TARGET_SCORE_MANY;
      expect(resolveRulesCard(scoring, { playerCount: n }).body).toContain(
        `First to ${target} wins.`,
      );
    }
  });

  it('timings in the copy match the sim', () => {
    expect(GHOST_DELAY_S * 1000).toBe(SIM_CONFIG.ghost.spawnDelayMs);
    expect(SHRINK_HOLD_S * 1000).toBe(SIM_CONFIG.arena.holdMs);
  });

  it('?howto= picks a 1-based card; ?players= defaults to 4', () => {
    expect(previewCardFromSearch('?debug=1&howto=3', 6)).toBe(2);
    expect(previewCardFromSearch('?howto=0', 6)).toBeNull();
    expect(previewCardFromSearch('?howto=7', 6)).toBeNull();
    expect(previewCardFromSearch('?debug=1', 6)).toBeNull();
    expect(previewPlayersFromSearch('?players=6')).toBe(6);
    expect(previewPlayersFromSearch('')).toBe(4);
  });
});
