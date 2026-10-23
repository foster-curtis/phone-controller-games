// Round (countdown + playing, SPEC §6.6): draws the interpolated sim snapshot each frame in the
// brand mark's style: skillet arena with a heat edge, mark-style eggs with player rings, slam rings,
// hit jiggle, steam ghosts and pulse puffs, name-tag stickers, spectator emoji and the HUD.
import * as Phaser from 'phaser';
import { EMOJI } from '../../shared/messages';
import { theme } from '../../shared/theme';
import type { PlayerView } from '../match';
import { drawArena } from '../render/arena';
import { drawEgg, JiggleTracker, RING_WIDTH } from '../render/egg';
import { EmojiLayer, EmojiRenderer } from '../render/emojiLayer';
import { drawGhost, drawPuff, GHOST_RADIUS, PuffTracker } from '../render/ghost';
import { createShrinkWarning, drawHud } from '../render/hud';
import { NameTags, type NameTagSpec } from '../render/names';
import { drawSlamRing, MaxFlashTracker } from '../render/slamRing';
import { HEIGHT, SCENE, WIDTH, addText, createRefresher, hostContext, playerColor } from './ui';

const CX = WIDTH / 2;
const CY = HEIGHT / 2;

export class RoundScene extends Phaser.Scene {
  private g!: Phaser.GameObjects.Graphics;
  private countdown!: Phaser.GameObjects.Text;
  private hud: Phaser.GameObjects.GameObject[] = [];
  private warning!: Phaser.GameObjects.Container;
  private tags!: NameTags;
  private emojiRenderer!: EmojiRenderer;
  private readonly emoji = new EmojiLayer();
  private readonly jiggle = new JiggleTracker();
  private readonly flash = new MaxFlashTracker();
  private readonly puffs = new PuffTracker();
  private refresh = createRefresher();
  private offs: (() => void)[] = [];

  constructor() {
    super(SCENE.round);
  }

  create(): void {
    const { runtime } = hostContext(this);
    this.cameras.main.setBackgroundColor(theme.color.background.hex);
    this.refresh = createRefresher();
    this.g = this.add.graphics().setDepth(1);
    this.hud = [];
    this.emoji.clear();
    this.jiggle.clear();
    this.tags = new NameTags(this);
    this.emojiRenderer = new EmojiRenderer(this);
    this.warning = createShrinkWarning(this);
    this.countdown = addText(this, CX, CY, '', 'title', theme.color.accentText)
      .setOrigin(0.5)
      .setStroke(theme.color.stickerOutline.hex, 14)
      .setDepth(10);

    this.offs = [
      runtime.onSimEvents((events) => {
        const now = this.time.now;
        for (const e of events) {
          if (e.type === 'collision') {
            this.jiggle.hit(e.a, e.speed, now);
            this.jiggle.hit(e.b, e.speed, now);
          } else if (e.type === 'pulse') {
            const gh = runtime.sim.snapshot().ghosts.find((x) => x.id === e.id);
            if (gh) this.puffs.add(gh.x, gh.y, now);
          }
        }
      }),
      runtime.match.onEvent((e) => {
        if (e.type === 'emoji') this.emoji.spawn(EMOJI[e.i], this.time.now);
      }),
    ];
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      for (const off of this.offs) off();
      this.offs = [];
      this.tags.destroy();
      this.emojiRenderer.destroy();
    });
  }

  override update(time: number): void {
    const { runtime } = hostContext(this);
    const view = runtime.view();
    const byId = new Map<string, PlayerView>(view.players.map((p) => [p.id, p]));
    const now = this.time.now;

    if (this.refresh(runtime, time)) {
      for (const o of this.hud) o.destroy();
      this.hud = drawHud(this, view);
    }
    this.countdown.setText(
      view.phase === 'countdown' ? String(Math.max(1, Math.ceil(view.countdownMs / 1000))) : '',
    );

    const snap = runtime.snapshot();
    const g = this.g.clear();
    drawArena(g, CX, CY, snap.arena, now);
    this.warning.setVisible(snap.arena.shrinking && view.phase === 'playing');

    const specs: NameTagSpec[] = [];

    for (const ghost of snap.ghosts) {
      const p = byId.get(ghost.id);
      const color = playerColor(p?.color ?? null);
      drawGhost(g, {
        x: CX + ghost.x,
        y: CY + ghost.y,
        color: p?.color ? theme.players[p.color].fill : color,
        windup: ghost.windup,
        cooldown: ghost.cooldown,
        now,
      });
      specs.push({
        id: `ghost:${ghost.id}`,
        name: p?.name ?? '',
        color: p?.color ?? null,
        x: CX + ghost.x,
        y: CY + ghost.y - GHOST_RADIUS - 40,
        alpha: 0.8,
      });
    }
    for (const puff of this.puffs.active(now))
      drawPuff(g, { ...puff, x: CX + puff.x, y: CY + puff.y });

    for (const egg of snap.eggs) {
      const x = CX + egg.x;
      const y = CY + egg.y;
      const p = byId.get(egg.id);
      const color = p?.color ? theme.players[p.color].fill : theme.color.muted;
      drawEgg(g, {
        x,
        y,
        radius: egg.radius,
        id: egg.id,
        color: { hex: color.hex, num: color.num },
        charge: egg.slamCharge,
        jiggle: this.jiggle.amount(egg.id, now),
        angle: egg.angle,
      });
      this.flash.update(egg.id, egg.slamMax, egg.slamCharge, now);
      drawSlamRing(
        g,
        x,
        y,
        egg.radius + RING_WIDTH * 2 + theme.stroke.sticker + 12,
        color,
        egg.slamCharge,
        this.flash.flash(egg.id, now),
      );
      specs.push({
        id: egg.id,
        name: p?.name ?? '',
        color: p?.color ?? null,
        x,
        y: y - egg.radius - RING_WIDTH * 2 - 30,
      });
    }
    this.tags.sync(specs);
    this.emoji.prune(now);
    this.emojiRenderer.render(this.emoji, now);
  }
}
