// A headless render context for the TV slice's tests (RD5): every Phaser object is a recording proxy,
// so a test can count which calls a view makes per frame (the frame-cost rule, SPEC §15.2) without
// loading Phaser. `calls` counts method calls by name across all fake objects.
import type { ArtImage } from '../../render/atlas';
import { FixedCamera, UNIT_PX } from '../../render/camera';
import type { RenderContext } from '../../render/context';
import type { LayerId } from '../../render/types';

export interface Fake {
  calls: Map<string, number>;
  /** Objects made (images, graphics, textures) and frame swaps: the things never done per frame. */
  made: { images: number; graphics: number; textures: number; frames: number };
  ctx: RenderContext;
  /** Method names called since `mark()`, with counts. */
  since(): Map<string, number>;
  mark(): void;
}

export function fakeRender(vb: [number, number, number, number] = [-20, -39, 40, 39]): Fake {
  const calls = new Map<string, number>();
  const made = { images: 0, graphics: 0, textures: 0, frames: 0 };
  const bump = (k: string) => calls.set(k, (calls.get(k) ?? 0) + 1);
  const proxy = (): unknown => {
    const o: Record<string, unknown> = { visible: true, list: [] };
    const p: unknown = new Proxy(o, {
      get(t, k: string) {
        if (k in t) return t[k];
        if (k === 'destroy') return () => bump('destroy');
        return (...a: unknown[]) => {
          bump(k);
          if (k === 'setVisible') t.visible = a[0];
          return p;
        };
      },
    });
    return p;
  };
  const art = (name: string, origin?: [number, number]): ArtImage => {
    made.images++;
    return {
      img: proxy() as ArtImage['img'],
      name,
      vb,
      ppuX: 1,
      ppuY: 1,
      unlit: false,
      origin: origin ?? [0, 0],
    };
  };
  const textures = new Set<string>();
  const layer = () => ({ add: () => bump('layer.add') });
  const layers = Object.fromEntries(
    (['ground', 'groundOverlay', 'world', 'effects', 'worldUi', 'hud'] as LayerId[]).map((id) => [
      id,
      layer(),
    ]),
  ) as unknown as RenderContext['layers'];
  const ctx = {
    scene: {
      textures: { exists: (k: string) => textures.has(k) },
      make: {
        image: () => {
          made.images++;
          return proxy();
        },
        graphics: () => {
          made.graphics++;
          const g = {
            fillStyle: () => g,
            fillCircle: () => g,
            generateTexture(k: string) {
              made.textures++;
              textures.add(k);
            },
            destroy() {},
          };
          return g;
        },
      },
    },
    lib: {
      frames: {},
      image: (name: string, origin?: [number, number]) => art(name, origin),
      setFrame(a: ArtImage, name: string) {
        made.frames++;
        a.name = name;
      },
      setOrigin(a: ArtImage, o: [number, number]) {
        a.origin = o;
        bump('lib.setOrigin');
      },
      setUnitScale() {
        bump('lib.setUnitScale');
      },
      anchor: () => [0, 0],
    },
    camera: new FixedCamera(),
    layers,
    unitPx: UNIT_PX,
  } as unknown as RenderContext;
  let base = new Map<string, number>();
  return {
    calls,
    made,
    ctx,
    mark: () => {
      base = new Map(calls);
    },
    since: () => {
      const out = new Map<string, number>();
      for (const [k, v] of calls) if (v !== (base.get(k) ?? 0)) out.set(k, v - (base.get(k) ?? 0));
      return out;
    },
  };
}
