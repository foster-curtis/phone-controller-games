// Name tags over eggs and ghosts (SPEC §6.6): sticker pills in the player color with `on` text and
// the `.tag` type. Clamped into the TV-safe rect so a tag never hangs off the screen.
import type * as Phaser from 'phaser';
import { theme } from '../../shared/theme';
import type { PlayerColorId } from '../../shared/messages';
import { addText } from '../scenes/ui';
import { clampToSafe } from './layout';
import { drawPill } from './sticker';

const PAD_X = theme.space[3];
const HEIGHT = 34;

interface Tag {
  container: Phaser.GameObjects.Container;
  key: string;
  width: number;
}

export interface NameTagSpec {
  id: string;
  name: string;
  color: PlayerColorId | null;
  /** Anchor: bottom-center of the tag. */
  x: number;
  y: number;
  alpha?: number;
}

export class NameTags {
  private readonly tags = new Map<string, Tag>();

  constructor(private readonly scene: Phaser.Scene) {}

  sync(specs: readonly NameTagSpec[]): void {
    const seen = new Set<string>();
    for (const s of specs) {
      seen.add(s.id);
      const key = `${s.name}|${s.color}`;
      let tag = this.tags.get(s.id);
      if (!tag || tag.key !== key) {
        tag?.container.destroy();
        tag = this.build(s, key);
        this.tags.set(s.id, tag);
      }
      const rect = clampToSafe({
        x: s.x - tag.width / 2,
        y: s.y - HEIGHT,
        w: tag.width,
        h: HEIGHT,
      });
      tag.container.setPosition(rect.x + tag.width / 2, rect.y + HEIGHT / 2);
      tag.container.setAlpha(s.alpha ?? 1);
    }
    for (const [id, tag] of this.tags) {
      if (!seen.has(id)) {
        tag.container.destroy();
        this.tags.delete(id);
      }
    }
  }

  private build(s: NameTagSpec, key: string): Tag {
    const token = s.color ? theme.players[s.color] : null;
    const text = addText(
      this.scene,
      0,
      0,
      s.name,
      'tag',
      token ? token.on : theme.color.foreground,
    ).setOrigin(0.5);
    const width = Math.ceil(text.width + PAD_X * 2);
    const g = this.scene.add.graphics();
    drawPill(
      g,
      { x: -width / 2, y: -HEIGHT / 2, w: width, h: HEIGHT },
      (token ? token.fill : theme.color.muted).num,
      { shadow: 'stickerSm' },
    );
    const container = this.scene.add.container(0, 0, [g, text]).setDepth(5);
    return { container, key, width };
  }

  destroy(): void {
    for (const t of this.tags.values()) t.container.destroy();
    this.tags.clear();
  }
}
