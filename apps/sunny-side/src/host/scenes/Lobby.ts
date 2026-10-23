// Lobby (SPEC §6.6 Screens): QR + room code + joined players, and the host's Start button.
import * as Phaser from 'phaser';
import { create as createQr } from 'qrcode';
import { theme } from '../../shared/theme';
import { joinUrl } from '../lan';
import {
  SAFE,
  SCENE,
  WIDTH,
  addButton,
  addText,
  canStart,
  createRefresher,
  drawStandings,
  hostContext,
  type HostButton,
} from './ui';

const QR_BOX = 480;
const QR_QUIET = 4;

export class LobbyScene extends Phaser.Scene {
  private dynamic: Phaser.GameObjects.GameObject[] = [];
  private qrFor: string | null = null;
  private qrObjects: Phaser.GameObjects.GameObject[] = [];
  private start!: HostButton;
  private refresh = createRefresher();

  constructor() {
    super(SCENE.lobby);
  }

  create(): void {
    const ctx = hostContext(this);
    this.cameras.main.setBackgroundColor(theme.color.background.hex);
    this.refresh = createRefresher();
    this.dynamic = [];
    this.qrObjects = [];
    this.qrFor = null;

    let top = SAFE;
    if (ctx.loopback) {
      const msg = ctx.lanUrl
        ? `Phones can't reach localhost. Open ${ctx.lanUrl} on this screen for a working QR.`
        : "Phones can't reach localhost. Open this page via the computer's LAN IP (pnpm dev:lan prints it).";
      const bar = this.add.rectangle(0, 0, WIDTH, 72, theme.color.danger.num).setOrigin(0, 0);
      addText(this, WIDTH / 2, 36, msg, 'label', theme.color.dangerOn).setOrigin(0.5);
      bar.setDepth(-1);
      top = SAFE + 24;
    }

    addText(this, SAFE, top, 'Scan to join', 'h2');
    addText(this, WIDTH / 2, top, 'Players', 'h2');

    this.start = addButton(this, WIDTH - SAFE - 160, 1080 - SAFE - 30, 'Start', () =>
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
    const top = ctx.loopback ? SAFE + 24 : SAFE;
    const code = runtime.code;

    if (code) {
      const url = joinUrl(ctx.origin, code);
      if (this.qrFor !== url) this.drawQr(url, SAFE, top + 72);
      const codeY = top + 72 + QR_BOX + theme.space[8];
      this.dynamic.push(
        addText(this, SAFE, codeY, 'Room code', 'label', theme.color.muted),
        addText(this, SAFE, codeY + 28, code, 'codeTv', theme.color.accentText),
        addText(this, SAFE, codeY + 112, url, 'body', theme.color.muted),
      );
    } else {
      const status = runtime.status === 'closed' ? 'Relay unavailable.' : 'Connecting to relay…';
      this.dynamic.push(addText(this, SAFE, top + 72, status, 'body', theme.color.muted));
    }

    const view = runtime.view();
    const listX = WIDTH / 2;
    if (view.players.length === 0) {
      this.dynamic.push(
        addText(this, listX, top + 72, 'Waiting for players…', 'body', theme.color.muted),
      );
    } else {
      this.dynamic.push(...drawStandings(this, listX, top + 72, view.players, { scoreX: 760 }));
    }
    this.dynamic.push(
      addText(
        this,
        listX,
        1080 - SAFE - 52,
        `First to ${view.targetScore} points wins`,
        'body',
        theme.color.muted,
      ),
    );
    this.start.setEnabled(canStart(view) && !view.paused);
  }

  private drawQr(url: string, x: number, y: number): void {
    for (const o of this.qrObjects) o.destroy();
    const qr = createQr(url, { errorCorrectionLevel: 'M' });
    const { size, data } = qr.modules;
    const cell = Math.floor(QR_BOX / (size + QR_QUIET * 2));
    const box = cell * (size + QR_QUIET * 2);
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
