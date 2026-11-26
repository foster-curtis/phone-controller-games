// Tip-off spike test scene (BUILD_PLAN TF4; SPEC §12.2 sizes): a 1920 × 1080 2D canvas standing in for
// the market until TF7: paving, two rows of stall blocks in canopy colors, and 30 character-sized boxes
// (about 1/10 of screen height, fabric-colored) wandering about. Gives the encoder a frame of realistic
// detail and the overlay real screen boxes. Colors from theme.ts (the brand mirror).
import { rngStream } from '@pcg/game-kit';
import type { ScreenBox } from '../../shared/viewer/hits';
import { theme } from '../../shared/theme';

export const SCENE_W = 1920;
export const SCENE_H = 1080;
export const CHARACTERS = 30;
/** Character box, px: 54 × 108 (SPEC §12.2 "about 1/10 of screen height"). */
const CW = 54;
const CH = 108;
/** Wander speed range, px/s. */
const SPEED = [40, 110] as const;

interface Walker {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  tunic: string;
  mantle: string;
}

export interface SpikeScene {
  readonly canvas: HTMLCanvasElement;
  /** Advances and redraws. */
  step(dtMs: number): void;
  /** Every character's screen box now, foot-sorted (ids 1..30). */
  boxes(): ScreenBox[];
}

export function createSpikeScene(parent: HTMLElement, seed = 1): SpikeScene {
  const canvas = document.createElement('canvas');
  canvas.className = 'spike-canvas';
  canvas.width = SCENE_W;
  canvas.height = SCENE_H;
  parent.append(canvas);
  const ctx = canvas.getContext('2d')!;
  const rng = rngStream(seed, 'spike');
  const fabrics = Object.values(theme.fabric).map((f) => f.hex);
  const canopies = Object.values(theme.canopy).map((c) => c.hex);

  const walkers: Walker[] = [];
  for (let id = 1; id <= CHARACTERS; id++) {
    const a = rng.next() * Math.PI * 2;
    const v = SPEED[0] + rng.next() * (SPEED[1] - SPEED[0]);
    walkers.push({
      id,
      x: CW + rng.next() * (SCENE_W - 2 * CW),
      y: 300 + rng.next() * (SCENE_H - 300 - CH),
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v * 0.6,
      tunic: rng.pick(fabrics),
      mantle: rng.pick(fabrics),
    });
  }

  function drawGround(): void {
    ctx.fillStyle = theme.color.forumGround.hex;
    ctx.fillRect(0, 0, SCENE_W, SCENE_H);
    ctx.strokeStyle = theme.color.paverLine.hex;
    ctx.lineWidth = 2;
    for (let y = 0, row = 0; y < SCENE_H; y += 29, row++) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(SCENE_W, y);
      for (let x = (row % 2) * 48; x < SCENE_W; x += 96) {
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + 29);
      }
      ctx.stroke();
    }
    // Two rows of five stall blocks: canopy, back shelf, counter.
    for (let i = 0; i < 10; i++) {
      const x = 60 + (i % 5) * 370;
      const y = i < 5 ? 30 : 560;
      ctx.fillStyle = theme.color.shelfBack.hex;
      ctx.fillRect(x, y + 40, 300, 120);
      ctx.fillStyle = canopies[i % canopies.length]!;
      ctx.fillRect(x - 10, y, 320, 50);
      ctx.fillStyle = theme.color.wood.hex;
      ctx.fillRect(x, y + 160, 300, 40);
      ctx.fillStyle = theme.color.woodLight.hex;
      ctx.fillRect(x, y + 160, 300, 8);
    }
  }

  function drawWalker(w: Walker): void {
    const x = Math.round(w.x - CW / 2);
    const y = Math.round(w.y - CH);
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = theme.translucent.scrim.hex;
    ctx.beginPath();
    ctx.ellipse(w.x, w.y, CW * 0.45, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = w.tunic;
    ctx.fillRect(x + 6, y + 34, CW - 12, CH - 40);
    ctx.fillStyle = w.mantle;
    ctx.fillRect(x + 6, y + 34, CW - 12, 22);
    ctx.fillStyle = theme.color.woodLight.hex; // skin stand-in until TF1's tone table
    ctx.beginPath();
    ctx.arc(w.x, y + 18, 16, 0, Math.PI * 2);
    ctx.fill();
  }

  function draw(): void {
    drawGround();
    for (const w of [...walkers].sort((a, b) => a.y - b.y || a.id - b.id)) drawWalker(w);
  }

  draw();
  return {
    canvas,
    step(dtMs) {
      const dt = dtMs / 1000;
      for (const w of walkers) {
        w.x += w.vx * dt;
        w.y += w.vy * dt;
        if (w.x < CW || w.x > SCENE_W - CW) w.vx = -w.vx;
        if (w.y < CH + 40 || w.y > SCENE_H - 8) w.vy = -w.vy;
        w.x = Math.min(SCENE_W - CW, Math.max(CW, w.x));
        w.y = Math.min(SCENE_H - 8, Math.max(CH + 40, w.y));
      }
      draw();
    },
    boxes() {
      return [...walkers]
        .sort((a, b) => a.y - b.y || a.id - b.id)
        .map((w) => ({ id: w.id, x: w.x - CW / 2, y: w.y - CH, w: CW, h: CH }));
    },
  };
}
