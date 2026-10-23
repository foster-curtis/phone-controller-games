// Shared scene helpers: brand text styles, host buttons, the text scoreboard and scene lookup.
// Colors/fonts/sizes come only from theme.ts. (M7 restyles these; M6 keeps them minimal.)
import type * as Phaser from 'phaser';
import type { PlayerColorId } from '../../shared/messages';
import { theme, type ColorToken, type TypeStyleName } from '../../shared/theme';
import type { GameRuntime } from '../game';
import type { MatchPhase, MatchView, PlayerView } from '../match';

export const WIDTH = 1920;
export const HEIGHT = 1080;
export const SAFE = theme.space.tvSafe;

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

export interface HostButton {
  readonly container: Phaser.GameObjects.Container;
  setEnabled(enabled: boolean): void;
}

/** A host control (Start / Next / Rematch / Lobby): accent pill with a sticker outline. */
export function addButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
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
  const h = text.height + theme.space[6] * 2;
  const bg = scene.add.graphics();
  bg.fillStyle(variant === 'accent' ? theme.color.accent.num : theme.color.surfaceStrong.num, 1);
  bg.fillRoundedRect(-w / 2, -h / 2, w, h, theme.radius.sticker);
  bg.lineStyle(theme.stroke.sticker, theme.color.stickerOutline.num, 1);
  bg.strokeRoundedRect(-w / 2, -h / 2, w, h, theme.radius.sticker);
  const container = scene.add.container(x, y, [bg, text]).setSize(w, h);
  container.setInteractive({ useHandCursor: true });
  let enabled = true;
  container.on('pointerup', () => {
    if (enabled) onClick();
  });
  return {
    container,
    setEnabled(on) {
      enabled = on;
      container.setAlpha(on ? 1 : 0.4);
    },
  };
}

/** Text scoreboard rows: color dot, name, score; left players greyed. Returns the objects made. */
export function drawStandings(
  scene: Phaser.Scene,
  x: number,
  y: number,
  players: readonly PlayerView[],
  opts: { rowHeight?: number; style?: TypeStyleName; scoreX?: number } = {},
): Phaser.GameObjects.GameObject[] {
  const style = opts.style ?? 'h2';
  const rowHeight = opts.rowHeight ?? theme.type[style].lineHeight + theme.space[3];
  const scoreX = opts.scoreX ?? 520;
  const made: Phaser.GameObjects.GameObject[] = [];
  sortedStandings(players).forEach((p, i) => {
    const cy = y + i * rowHeight;
    const dim = p.left || !p.connected;
    const dot = scene.add
      .circle(x + 12, cy + rowHeight / 2 - theme.space[2], 12, playerColor(p.color).num)
      .setStrokeStyle(theme.stroke.sticker, theme.color.eggOutline.num);
    const nameColor = dim ? theme.color.presenceOff : theme.color.foreground;
    const name = addText(scene, x + 40, cy, displayName(p), style, nameColor);
    const score = addText(scene, x + scoreX, cy, String(p.score), style, theme.color.accentText);
    score.setOrigin(1, 0);
    if (dim) dot.setAlpha(0.5);
    made.push(dot, name, score);
  });
  return made;
}

export function displayName(p: PlayerView): string {
  const name = p.name || 'Joining…';
  const tags = [p.isLeader ? 'leader' : '', p.left ? 'left' : !p.connected ? 'away' : '']
    .filter(Boolean)
    .join(', ');
  return tags ? `${name} (${tags})` : name;
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
