// Shared scene helpers: brand text styles, sticker host buttons, standings order and scene lookup.
// Colors/fonts/sizes come only from theme.ts.
import type * as Phaser from 'phaser';
import type { PlayerColorId } from '../../shared/messages';
import { theme, type ColorToken, type TypeStyleName } from '../../shared/theme';
import type { GameRuntime } from '../game';
import type { MatchPhase, MatchView, PlayerView } from '../match';
import { HEIGHT, SAFE, WIDTH } from '../render/layout';
import { drawSticker } from '../render/sticker';

export { HEIGHT, SAFE, WIDTH };

export const SCENE = {
  boot: 'boot',
  lobby: 'lobby',
  round: 'round',
  results: 'results',
  winner: 'winner',
} as const;
export type SceneKey = (typeof SCENE)[keyof typeof SCENE];

/** Which scene shows each match phase. */
export const SCENE_FOR_PHASE: Record<MatchPhase, SceneKey> = {
  lobby: SCENE.lobby,
  countdown: SCENE.round,
  playing: SCENE.round,
  results: SCENE.results,
  matchEnd: SCENE.winner,
};

/** What every scene can reach (stored in the game registry by main.ts). */
export interface HostContext {
  runtime: GameRuntime;
  /** `location.origin` of the host page (the QR's join URL base). */
  origin: string;
  /** Host page opened via localhost: phones can't use the QR. */
  loopback: boolean;
  /** The LAN host URL to suggest instead (dev server only), or null. */
  lanUrl: string | null;
  /** The QR the lobby drew (for `__pcg.qr()`). */
  qr: { url: string; size: number; modules: number[] } | null;
}

const CONTEXT_KEY = 'pcg';

export function setHostContext(game: Phaser.Game, ctx: HostContext): void {
  game.registry.set(CONTEXT_KEY, ctx);
}

export function hostContext(scene: Phaser.Scene): HostContext {
  return scene.registry.get(CONTEXT_KEY) as HostContext;
}

export function textStyle(
  name: TypeStyleName,
  color: ColorToken = theme.color.foreground,
): Phaser.Types.GameObjects.Text.TextStyle {
  const t = theme.type[name];
  return {
    fontFamily: t.family,
    fontSize: `${t.size}px`,
    fontStyle: t.weight === 600 ? '600' : 'normal',
    color: color.hex,
  };
}

export function addText(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  name: TypeStyleName,
  color: ColorToken = theme.color.foreground,
): Phaser.GameObjects.Text {
  const t = scene.add.text(x, y, text, textStyle(name, color));
  const spacing = theme.type[name].letterSpacing;
  if (spacing) t.setLetterSpacing(spacing);
  return t;
}

export function playerColor(color: PlayerColorId | null): ColorToken {
  return color ? theme.players[color].fill : theme.color.muted;
}

export function playerOn(color: PlayerColorId | null): ColorToken {
  return color ? theme.players[color].on : theme.color.foreground;
}

export interface HostButton {
  readonly container: Phaser.GameObjects.Container;
  readonly width: number;
  readonly height: number;
  setEnabled(enabled: boolean): void;
}

export const BUTTON_HEIGHT = 84;

/**
 * A host control (Start / Next / Rematch / Lobby): accent sticker pill. `right`/`top` anchor its
 * top-right corner (so rows of buttons can be laid out right to left inside the TV-safe rect).
 */
export function addButton(
  scene: Phaser.Scene,
  right: number,
  top: number,
  label: string,
  onClick: () => void,
  variant: 'accent' | 'plain' = 'accent',
): HostButton {
  const text = addText(
    scene,
    0,
    0,
    label,
    'pad',
    variant === 'accent' ? theme.color.accentOn : theme.color.foreground,
  ).setOrigin(0.5);
  const w = Math.max(240, text.width + theme.space[12] * 2);
  const h = BUTTON_HEIGHT - theme.shadow.sticker.y;
  const bg = scene.add.graphics();
  drawSticker(
    bg,
    { x: -w / 2, y: -h / 2, w, h },
    (variant === 'accent' ? theme.color.accent : theme.color.surfaceStrong).num,
    { radius: theme.radius.pill },
  );
  const container = scene.add
    .container(right - theme.shadow.sticker.x - w / 2, top + h / 2, [bg, text])
    .setSize(w, h);
  container.setInteractive({ useHandCursor: true });
  let enabled = true;
  container.on('pointerup', () => {
    if (enabled) onClick();
  });
  return {
    container,
    width: w + theme.shadow.sticker.x,
    height: BUTTON_HEIGHT,
    setEnabled(on) {
      enabled = on;
      container.setAlpha(on ? 1 : 0.4);
    },
  };
}

export function displayName(p: PlayerView): string {
  return p.name || 'Joining…';
}

/** Score desc, then join order (SPEC §6.7 standings). */
export function sortedStandings(players: readonly PlayerView[]): PlayerView[] {
  return [...players].sort((a, b) => b.score - a.score || a.joinIndex - b.joinIndex);
}

export function canStart(view: MatchView): boolean {
  return view.players.filter((p) => p.connected && !p.left).length >= 2;
}

/**
 * Re-runs `render` whenever the runtime's version moves (match events, room/status changes) and at
 * least every `everyMs` (profiles arrive as messages, not events). Call from `update()`.
 */
export function createRefresher(everyMs = 250): (runtime: GameRuntime, now: number) => boolean {
  let lastVersion = -1;
  let lastAt = -Infinity;
  return (runtime, now) => {
    if (runtime.version === lastVersion && now - lastAt < everyMs) return false;
    lastVersion = runtime.version;
    lastAt = now;
    return true;
  };
}
