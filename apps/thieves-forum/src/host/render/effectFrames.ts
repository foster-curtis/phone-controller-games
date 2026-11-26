// Effect kinds → their sprites.json frames, default lifetimes and layer (SPEC §6.9, §6.12–§6.15;
// ART_NOTES "Effects"). Phaser-free, so the asset-key test imports it.
import type { EffectKind, FrameKey } from './types';

/** Frame, default lifetime (ms) and layer per kind. */
export const EFFECT_FRAMES: Record<EffectKind, { frame: FrameKey; ms: number; ground?: boolean }> =
  {
    alertBang: { frame: 'alert-bang', ms: 900 },
    caughtBurst: { frame: 'caught-burst', ms: 1000 },
    glanceSwoosh: { frame: 'glance-swoosh', ms: 400 },
    glint: { frame: 'glint', ms: 800 },
    questionBubble: { frame: 'question-bubble', ms: 1500 },
    thiefBubble: { frame: 'thief-bubble', ms: 1400 },
    speedLines: { frame: 'speed-lines', ms: 400 },
    confetti: { frame: 'confetti-pieces', ms: 1800 },
    fireworkGold: { frame: 'firework-gold', ms: 1200 },
    fireworkWhite: { frame: 'firework-white', ms: 1200 },
    crown: { frame: 'crown-laurel', ms: 3000 },
    playerRing: { frame: 'player-ring', ms: 3000, ground: true },
    coin: { frame: 'coin', ms: 600 },
    coinFlat: { frame: 'coin-flat', ms: 2000, ground: true },
  };
