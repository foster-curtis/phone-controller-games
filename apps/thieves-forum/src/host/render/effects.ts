// Effect spawners (SPEC §6.9, §6.12–§6.15; ART_NOTES "Effects"): one-shot sprites with a simple
// pop, hold and fade, and the coin toss arc. Timing polish is TF20's (effects choreography); this
// is the API the scene calls. Effects never mark a grab, a pickpocket or a tip payout (§6.11).
import type * as Phaser from 'phaser';
import type { Vec2 } from '../../content/types';
import {
  addPiece,
  destroyPiece,
  placePiece,
  setPieceAlpha,
  tintPiece,
  type ArtLibrary,
  type ArtPiece,
} from './atlas';
import { CHAR_UNIT_PX } from './camera';
import { EFFECT_FRAMES } from './effectFrames';
import type { EffectKind, EffectOptions, EffectSpawner } from './types';

type Layers = Record<'ground' | 'overlay', Phaser.GameObjects.Layer>;

interface Live {
  kind: EffectKind;
  piece: ArtPiece;
  at: Vec2;
  age: number;
  ms: number;
  scale: number;
  mirror: boolean;
  /** Coin arc: start and end points. */
  arc?: { from: Vec2; to: Vec2 };
}

export class Effects implements EffectSpawner {
  private live: Live[] = [];

  constructor(
    private readonly lib: ArtLibrary,
    private readonly layers: Layers,
    private readonly unitPx = CHAR_UNIT_PX,
  ) {}

  get active(): number {
    return this.live.length;
  }

  spawn(kind: EffectKind, at: Vec2, opts: EffectOptions = {}) {
    const k = EFFECT_FRAMES[kind];
    const piece = this.lib.piece(k.frame);
    if (opts.tint !== undefined) tintPiece(piece, { player: opts.tint });
    addPiece(piece, k.ground ? this.layers.ground : this.layers.overlay);
    const e: Live = {
      kind,
      piece,
      at,
      age: 0,
      ms: opts.ms ?? k.ms,
      scale: opts.scale ?? 1,
      mirror: opts.mirror ?? false,
    };
    this.live.push(e);
    this.draw(e);
  }

  coinArc(from: Vec2, to: Vec2, ms = 700) {
    const piece = this.lib.piece(EFFECT_FRAMES.coin.frame);
    addPiece(piece, this.layers.overlay);
    const e: Live = {
      kind: 'coin',
      piece,
      at: from,
      age: 0,
      ms,
      scale: 1,
      mirror: false,
      arc: { from, to },
    };
    this.live.push(e);
    this.draw(e);
  }

  update(dtMs: number) {
    const done: Live[] = [];
    for (const e of this.live) {
      e.age += dtMs;
      if (e.age >= e.ms) done.push(e);
      else this.draw(e);
    }
    for (const e of done) {
      destroyPiece(e.piece);
      if (e.arc) {
        this.spawn('coinFlat', e.arc.to);
        this.spawn('glint', { x: e.arc.to.x, y: e.arc.to.y - 4 });
      }
    }
    if (done.length > 0) this.live = this.live.filter((e) => !done.includes(e));
  }

  private draw(e: Live) {
    const u = Math.min(1, e.age / e.ms);
    const k = this.unitPx * e.scale;
    let x = e.at.x;
    let y = e.at.y;
    let sx = e.mirror ? -1 : 1;
    let sy = 1;
    let rot = 0;
    let alpha = 1;
    const pop = Math.min(1, e.age / 120);
    const fadeOut = u > 0.75 ? 1 - (u - 0.75) / 0.25 : 1;
    switch (e.kind) {
      case 'glint':
        rot = u * Math.PI;
        sx = sy = Math.sin(u * Math.PI);
        break;
      case 'thiefBubble':
        x += Math.sin(e.age / 25) * 1.5;
        sx *= pop;
        sy = pop;
        alpha = fadeOut;
        break;
      case 'crown':
        y += Math.sin(e.age / 250) * 3;
        sx = Math.cos(e.age / 400);
        break;
      case 'fireworkGold':
      case 'fireworkWhite':
        sx = sy = 0.3 + 0.7 * Math.sqrt(u);
        alpha = 1 - u;
        break;
      case 'confetti':
        y += u * 60;
        alpha = fadeOut;
        break;
      case 'coin':
        if (e.arc) {
          // Ease-out rising, ease-in falling; flipping end over end (ART_NOTES).
          x = e.arc.from.x + (e.arc.to.x - e.arc.from.x) * u;
          y = e.arc.from.y + (e.arc.to.y - e.arc.from.y) * u - Math.sin(u * Math.PI) * 80;
          sy = Math.cos(e.age / 40);
        }
        break;
      default:
        sx *= pop;
        sy = pop;
        alpha = fadeOut;
    }
    placePiece(e.piece, x, y, k, rot, sx, sy);
    setPieceAlpha(e.piece, alpha);
  }
}
