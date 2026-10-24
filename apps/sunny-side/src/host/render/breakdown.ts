// Round points breakdown for the TV Results / Winner scenes (C2 note): per player a sticker row in
// their color with the round's points, the itemized reasons, how they went out and the new total.
// Labels come from the data (`items[].points`), never hardcoded +1/+3.
import type * as Phaser from 'phaser';
import type {
  PlayerColorId,
  RoundBreakdown,
  RoundBreakdownEntry,
  RoundPointItem,
} from '../../shared/messages';
import { theme } from '../../shared/theme';
import type { PlayerView } from '../match';
import { addText } from '../scenes/ui';
import { BD_POINTS_SIZE, BD_TEXT_FALLBACK, breakdownLayout, type Rect } from './layout';
import { drawPanel, drawPill, drawSticker } from './sticker';

export function pointsLabel(points: number): string {
  return `${points >= 0 ? '+' : ''}${points}`;
}

export function itemLabel(item: RoundPointItem): string {
  return item.kind === 'ko'
    ? `KO ${item.victimName} ${pointsLabel(item.points)}`
    : `Survivor ${pointsLabel(item.points)}`;
}

export function outLabel(entry: RoundBreakdownEntry): string {
  if (entry.out === null) {
    return entry.items.some((i) => i.kind === 'survivor') ? 'survived' : 'still on the pan';
  }
  return entry.out.byName ? `knocked out by ${entry.out.byName}` : 'fell off';
}

export interface BreakdownRowModel {
  playerId: string;
  name: string;
  color: PlayerColorId;
  points: string;
  items: string[];
  out: string;
  total: string;
  left: boolean;
}

export function breakdownRowModels(b: RoundBreakdown): BreakdownRowModel[] {
  return b.players.map((e) => ({
    playerId: e.playerId,
    name: e.name,
    color: e.color,
    points: pointsLabel(e.points),
    items: e.items.map(itemLabel),
    out: outLabel(e),
    total: String(e.total),
    left: e.left,
  }));
}

/** Rows for the no-breakdown fallback: just standings (name + total). */
function standingsModels(players: readonly PlayerView[]): BreakdownRowModel[] {
  return [...players]
    .filter((p) => p.color)
    .sort((a, b) => b.score - a.score || a.joinIndex - b.joinIndex)
    .map((p) => ({
      playerId: p.id,
      name: p.name || 'Joining…',
      color: p.color as PlayerColorId,
      points: '',
      items: [],
      out: '',
      total: String(p.score),
      left: p.left,
    }));
}

function centered(
  scene: Phaser.Scene,
  r: Rect,
  text: string,
  style: Parameters<typeof addText>[4],
  color: Parameters<typeof addText>[5],
  align: 'left' | 'center' | 'right',
): Phaser.GameObjects.Text {
  const ox = align === 'left' ? 0 : align === 'center' ? 0.5 : 1;
  const x = r.x + r.w * ox;
  return addText(scene, x, r.y + r.h / 2, text, style, color).setOrigin(ox, 0.5);
}

/**
 * Draws the breakdown (or, when `breakdown` is null/empty, plain standings) inside `area`.
 * Returns every object made so the caller can destroy them on refresh.
 */
export function drawBreakdown(
  scene: Phaser.Scene,
  area: Rect,
  breakdown: RoundBreakdown | null | undefined,
  players: readonly PlayerView[],
): Phaser.GameObjects.GameObject[] {
  const hasData = !!breakdown && breakdown.players.length > 0;
  const models = hasData ? breakdownRowModels(breakdown) : standingsModels(players);
  if (models.length === 0) return [];
  const layout = breakdownLayout(models.length, area, !hasData);
  const g = scene.add.graphics();
  const made: Phaser.GameObjects.GameObject[] = [g];
  drawPanel(g, layout.panel);

  models.forEach((m, i) => {
    const cells = layout.rows[i]!;
    const token = theme.players[m.color];
    const fill = m.left ? theme.color.presenceOff.num : token.fill.num;
    const alpha = m.left ? 0.5 : 1;
    const row = cells.row;
    drawSticker(g, row, theme.color.surfaceStrong.num, {
      shadow: 'stickerSm',
      alpha,
      radius: theme.radius.sticker,
    });
    const pillRect: Rect = { x: row.x + 6, y: row.y + 6, w: cells.pill.w - 6, h: row.h - 12 };
    drawPill(g, pillRect, fill, { shadow: 'none', alpha });
    made.push(
      centered(
        scene,
        pillRect,
        m.left ? `${m.name} (left)` : m.name,
        'tag',
        m.left ? theme.color.foreground : token.on,
        'center',
      ).setAlpha(alpha),
    );
    const totalColor = theme.color.foreground;
    made.push(centered(scene, cells.total, m.total, 'score', totalColor, 'center').setAlpha(alpha));
    if (layout.compact) return;

    made.push(
      centered(
        scene,
        cells.points,
        m.points,
        'score',
        m.points === '+0' ? theme.color.muted : theme.color.accentText,
        'center',
      )
        .setFontSize(BD_POINTS_SIZE)
        .setAlpha(alpha),
    );
    const items = m.items.length > 0 ? m.items.join('   ') : 'no points';
    const itemsText = centered(
      scene,
      cells.items,
      items,
      'pad',
      m.items.length > 0 ? theme.color.foreground : theme.color.muted,
      'left',
    )
      .setWordWrapWidth(cells.items.w)
      .setAlpha(alpha);
    if (itemsText.height > row.h - 8) itemsText.setFontSize(BD_TEXT_FALLBACK);
    const outText = centered(scene, cells.out, m.out, 'pad', theme.color.muted, 'left')
      .setWordWrapWidth(cells.out.w)
      .setAlpha(alpha);
    if (outText.height > row.h - 8) outText.setFontSize(BD_TEXT_FALLBACK);
    made.push(itemsText, outText);
  });
  return made;
}
