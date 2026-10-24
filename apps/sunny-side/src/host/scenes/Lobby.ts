// Lobby (SPEC §6.6 Screens): sticker title with the mark, QR + room code panels, joined players as
// color pills, and the host's Start button.
import * as Phaser from 'phaser';
import { create as createQr } from 'qrcode';
import { theme } from '../../shared/theme';
import { joinUrl } from '../lan';
import { lobbyLayout, type Rect } from '../render/layout';
import { addRemoveButton } from '../render/remove';
import { drawPanel, drawPill, drawSticker } from '../render/sticker';
import {
  SAFE,
  SCENE,
  WIDTH,
  addButton,
  addText,
  canStart,
  createRefresher,
  hostContext,
  installRemoveClicks,
  sceneRemoveControls,
  sortedStandings,
  type HostButton,
} from './ui';

const QR_BOX = 480;
const QR_QUIET = 4;
const MARK_KEY = 'brand-mark';
const MARK_SIZE = 130;

export class LobbyScene extends Phaser.Scene {
  private dynamic: Phaser.GameObjects.GameObject[] = [];
  private qrFor: string | null = null;
  private qrObjects: Phaser.GameObjects.GameObject[] = [];
  private start!: HostButton;
  private refresh = createRefresher();

  constructor() {
    super(SCENE.lobby);
  }

  preload(): void {
    // The brand mark (public/icon-512.png is the mark rasterized).
    if (!this.textures.exists(MARK_KEY)) {
      this.load.image(MARK_KEY, `${import.meta.env.BASE_URL}icon-512.png`);
    }
  }

  create(): void {
    const ctx = hostContext(this);
    this.cameras.main.setBackgroundColor(theme.color.background.hex);
    this.refresh = createRefresher();
    this.dynamic = [];
    ctx.removeButtons = [];
    installRemoveClicks(this, () => {
      this.refresh = createRefresher();
    });
    this.qrObjects = [];
    this.qrFor = null;

    if (ctx.loopback) {
      const msg = ctx.lanUrl
        ? `Phones can't reach localhost. Open ${ctx.lanUrl} on this screen for a working QR.`
        : "Phones can't reach localhost. Open this page via the computer's LAN IP (pnpm dev:lan prints it).";
      this.add.rectangle(0, 0, WIDTH, 72, theme.color.danger.num).setOrigin(0, 0).setDepth(-1);
      addText(this, WIDTH / 2, 36, msg, 'label', theme.color.dangerOn).setOrigin(0.5);
    }

    const L = lobbyLayout(0);
    const titleY = L.title.y + 110;
    if (this.textures.exists(MARK_KEY)) {
      this.add
        .image(L.title.x + MARK_SIZE / 2, titleY, MARK_KEY)
        .setDisplaySize(MARK_SIZE, MARK_SIZE)
        .setAngle(theme.tilt.title);
    }
    addText(this, L.title.x + MARK_SIZE + theme.space[4], titleY, 'Sunny Side Shove', 'title')
      .setOrigin(0, 0.5)
      .setAngle(theme.tilt.title)
      .setStroke(theme.color.stickerOutline.hex, 10)
      .setShadow(
        theme.shadow.sticker.x * 2,
        theme.shadow.sticker.y * 2,
        theme.shadow.sticker.color.hex,
        theme.shadow.sticker.blur,
        true,
        true,
      );

    const panels = this.add.graphics().setDepth(-1);
    drawPanel(panels, L.qrPanel);
    drawPanel(panels, L.codePanel);
    drawPanel(panels, L.playersPanel);

    this.start = addButton(this, WIDTH - SAFE, L.startButton.y, 'Start', () =>
      ctx.runtime.match.hostAction('start'),
    );
    this.render();
  }

  override update(time: number): void {
    if (this.refresh(hostContext(this).runtime, time)) this.render();
  }

  private render(): void {
    const ctx = hostContext(this);
    const { runtime } = ctx;
    for (const o of this.dynamic) o.destroy();
    this.dynamic = [];
    const view = runtime.view();
    const players = sortedStandings(view.players).sort((a, b) => a.joinIndex - b.joinIndex);
    const L = lobbyLayout(players.length);
    ctx.removeButtons = [];
    const removeCtl = sceneRemoveControls(this, () => {
      this.refresh = createRefresher();
    });
    const code = runtime.code;

    if (code) {
      const url = joinUrl(ctx.origin, code);
      if (this.qrFor !== url) this.drawQr(url, L.qrPanel);
      this.dynamic.push(
        addText(
          this,
          L.codePanel.x + 20,
          L.codePanel.y + 12,
          'Room code',
          'label',
          theme.color.muted,
        ),
        addText(
          this,
          L.codePanel.x + 20,
          L.codePanel.y + 38,
          code,
          'codeTv',
          theme.color.accentText,
        ),
        addText(this, L.codePanel.x + 20, L.codePanel.y + 112, url, 'caption', theme.color.muted),
      );
    } else {
      const status = runtime.status === 'closed' ? 'Relay unavailable.' : 'Connecting to relay…';
      this.dynamic.push(
        addText(this, L.qrPanel.x + 24, L.qrPanel.y + 24, status, 'body', theme.color.muted),
      );
    }

    if (players.length === 0) {
      this.dynamic.push(
        addText(
          this,
          L.playersPanel.x + 24,
          L.playersPanel.y + 24,
          'Waiting for players…',
          'body',
          theme.color.muted,
        ),
      );
    } else {
      const g = this.add.graphics();
      this.dynamic.push(g);
      players.forEach((p, i) => {
        const row: Rect = L.rows[i]!;
        const dim = p.left || !p.connected;
        const token = p.color ? theme.players[p.color] : null;
        const alpha = dim ? 0.45 : 1;
        const pill: Rect = { x: row.x + 4, y: row.y + 6, w: 380, h: row.h - 14 };
        drawPill(g, pill, dim || !token ? theme.color.presenceOff.num : token.fill.num, {
          alpha,
          shadow: 'stickerSm',
        });
        this.dynamic.push(
          addText(
            this,
            pill.x + 24,
            pill.y + pill.h / 2,
            p.name || 'Joining…',
            'pad',
            token && !dim ? token.on : theme.color.foreground,
          )
            .setOrigin(0, 0.5)
            .setAlpha(alpha),
        );
        const tags = [p.isLeader ? 'Leader' : '', p.left ? 'Left' : !p.connected ? 'Away' : '']
          .filter(Boolean)
          .join('  ·  ');
        if (tags) {
          const tag: Rect = { x: pill.x + pill.w + 24, y: pill.y + 6, w: 150, h: pill.h - 12 };
          drawSticker(g, tag, theme.color.cream.num, {
            shadow: 'stickerSm',
            radius: theme.radius.pill,
          });
          this.dynamic.push(
            addText(
              this,
              tag.x + tag.w / 2,
              tag.y + tag.h / 2,
              tags,
              'label',
              theme.color.creamOn,
            ).setOrigin(0.5),
          );
        }
        this.dynamic.push(...addRemoveButton(this, L.removes[i]!, p.id, removeCtl));
      });
    }
    this.dynamic.push(
      addText(
        this,
        L.footer.x,
        L.footer.y + 24,
        `First to ${view.targetScore} points wins`,
        'h2',
        theme.color.muted,
      ),
    );
    this.start.setEnabled(canStart(view) && !view.paused);
  }

  private drawQr(url: string, panel: Rect): void {
    for (const o of this.qrObjects) o.destroy();
    const qr = createQr(url, { errorCorrectionLevel: 'M' });
    const { size, data } = qr.modules;
    const cell = Math.floor(QR_BOX / (size + QR_QUIET * 2));
    const box = cell * (size + QR_QUIET * 2);
    const x = panel.x + (panel.w - box) / 2;
    const y = panel.y + (panel.h - box) / 2;
    const g = this.add.graphics();
    g.fillStyle(theme.color.cream.num, 1);
    g.fillRoundedRect(x, y, box, box, theme.radius.sticker);
    g.fillStyle(theme.color.eggOutline.num, 1);
    const ox = x + cell * QR_QUIET;
    const oy = y + cell * QR_QUIET;
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (data[r * size + c]) g.fillRect(ox + c * cell, oy + r * cell, cell, cell);
      }
    }
    this.qrObjects = [g];
    this.qrFor = url;
    hostContext(this).qr = { url, size, modules: Array.from(data, (v) => (v ? 1 : 0)) };
  }
}
