// Threshold bloom (SPEC §15.2): one pass on the composited world (layers 1–4, the main camera) at
// half resolution. The threshold is hue-selective: it keeps only amber (#e8a33d, ember cores) and
// violet (#8f6bff, hostile cores), never the gunmetal or violet-iron shades, player colors or danger
// red. Phaser 4 has no bloom filter, so this is a custom select pass (which also halves the
// resolution) + Phaser's Blur, in a ParallelFilters added back with ADD (BUILD_PLAN §8).
import * as Phaser from 'phaser';

const NODE = 'FFBloomSelect';

const FRAG = `#pragma phaserTemplate(shaderName)
precision mediump float;
uniform sampler2D uMainSampler;
uniform vec2 uTexel;
uniform float uStrength;
varying vec2 outTexCoord;

vec3 hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  float e = 1.0e-10;
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}

vec4 pick(vec2 uv) {
  vec4 c = texture2D(uMainSampler, uv);
  if (c.a <= 0.0) return vec4(0.0);
  vec3 h = hsv(c.rgb / c.a);
  // Amber family: hue 25-54 deg, saturated, bright.
  float amber = smoothstep(0.04, 0.07, h.x) * (1.0 - smoothstep(0.14, 0.17, h.x))
    * smoothstep(0.3, 0.45, h.y) * smoothstep(0.72, 0.85, h.z);
  // Violet family: hue 238-280 deg, bright (the hostile core is pale violet).
  float violet = smoothstep(0.64, 0.67, h.x) * (1.0 - smoothstep(0.77, 0.8, h.x))
    * smoothstep(0.18, 0.28, h.y) * smoothstep(0.8, 0.92, h.z);
  return c * max(amber, violet);
}

void main() {
  // 2x2 box: this pass renders at half size, so it also downsamples.
  vec2 o = uTexel * 0.5;
  vec4 s = pick(outTexCoord + vec2(-o.x, -o.y)) + pick(outTexCoord + vec2(o.x, -o.y))
    + pick(outTexCoord + vec2(-o.x, o.y)) + pick(outTexCoord + vec2(o.x, o.y));
  gl_FragColor = s * 0.25 * uStrength;
}
`;

/** The select pass's controller. */
export class BloomSelect extends Phaser.Filters.Controller {
  strength = 1.2;
  /** 2 = half resolution; 4 = quarter (the integrated-GPU fallback, §15.2 risk). */
  divisor = 2;
  constructor(camera: Phaser.Cameras.Scene2D.Camera) {
    super(camera, NODE);
  }
}

type DrawingContext = Phaser.Renderer.WebGL.DrawingContext;

class BloomSelectNode extends Phaser.Renderer.WebGL.RenderNodes.BaseFilterShader {
  private texel: [number, number] = [0, 0];

  constructor(manager: Phaser.Renderer.WebGL.RenderNodes.RenderNodeManager) {
    super(NODE, manager, undefined, FRAG);
  }

  override run(
    controller: Phaser.Filters.Controller,
    input: DrawingContext,
    output?: DrawingContext,
    padding?: Phaser.Geom.Rectangle,
  ): DrawingContext {
    const d = (controller as BloomSelect).divisor;
    this.texel = [1 / input.width, 1 / input.height];
    const out =
      output ??
      this.manager.renderer.drawingContextPool.get(
        Math.max(1, Math.ceil(input.width / d)),
        Math.max(1, Math.ceil(input.height / d)),
      );
    return super.run(controller, input, out, padding);
  }

  override setupUniforms(controller: Phaser.Filters.Controller, _dc: DrawingContext) {
    this.programManager.setUniform('uTexel', this.texel);
    this.programManager.setUniform('uStrength', (controller as BloomSelect).strength);
  }
}

export interface Bloom {
  readonly parallel: Phaser.Filters.ParallelFilters;
  readonly select: BloomSelect;
  readonly blur: Phaser.Filters.Blur;
  setEnabled(on: boolean): void;
  readonly enabled: boolean;
}

/** Adds the bloom to a camera (the world camera: layers 1–4). WebGL only; null on Canvas. */
export function addBloom(camera: Phaser.Cameras.Scene2D.Camera): Bloom | null {
  const renderer = camera.scene.sys.renderer;
  if (!(renderer instanceof Phaser.Renderer.WebGL.WebGLRenderer)) return null;
  const nodes = renderer.renderNodes;
  if (!nodes.getNode(NODE)) {
    nodes.addNodeConstructor(NODE, BloomSelectNode as unknown as typeof Phaser.Renderer.WebGL.RenderNodes.RenderNode);
  }
  const parallel = camera.filters.internal.addParallelFilters();
  const select = new BloomSelect(camera);
  parallel.top.add(select);
  const blur = parallel.top.addBlur(0, 2, 2, 1.4, 0xffffff, 3);
  parallel.blend.blendMode = Phaser.BlendModes.ADD;
  parallel.blend.amount = 1;
  return {
    parallel,
    select,
    blur,
    get enabled() {
      return parallel.active;
    },
    setEnabled(on: boolean) {
      parallel.active = on;
    },
  };
}
