// Asset pipeline (SPEC §12.10, §12.2, §6.21), run by `pnpm assets` before dev, build, typecheck, test
// and e2e. Copied from Fort Frenzy (`apps/fort-frenzy/scripts/build-atlases.ts`), extraction
// candidate, BUILD_PLAN §8; adapted to the forum art, whose rig parts are `id` groups inside one SVG
// per view and pose rather than one file per part.
// Writes into the gitignored generated/ folder:
//   - generated/manifest.ts: every frame (rig parts from art/forum/rigs/*.json, everything else from
//     art/forum/sprites.json) with its viewBox, anchor, layer, px per unit, attach points and its
//     raster layers;
//   - generated/atlases/forum@<s>x-<i>.png / .json at 1× and 2× (Phaser JSON hash, ≤ 4096²);
//   - generated/keys.ts: the frame names as a string union (typed keys for the renderer) and the
//     atlas list.
// Tinting (SPEC §12.2): a frame is split into runs of consecutive shapes that share a tint slot
// (`var(--tunic, …)` and friends) or have none. Tint runs are rasterized white and multiplied by the
// slot color at draw time, so one raster serves every outfit; the rest keep their own colors.
// Validates every rig (views, poses, every part listed in every pose, sources, parents, attach
// points) and fails if an SVG outside the composed `*reference*` files is named by nothing.
// `--watch` (dev) rebuilds on art changes and only warns: the renderer's dev-only fallback shapes
// cover a missing frame. Every other run fails instead.
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  watch,
  writeFileSync,
} from 'node:fs';
import { deflateSync } from 'node:zlib';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import { MaxRectsPacker } from 'maxrects-packer';
import {
  RIG_IDS,
  SPRITE_CATEGORIES,
  TINT_SLOTS,
  VIEW_IDS,
  rigFrameName,
  type AssetManifest,
  type AtlasFile,
  type FrameLayerRef,
  type FrameMeta,
  type RigDef,
  type RigId,
  type RigPose,
  type SpritesJson,
  type TintSlot,
  type ViewBox,
} from '../src/host/render/types';

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const artRoot = join(appRoot, 'art', 'forum');
const outRoot = join(appRoot, 'generated');

const ATLAS_PREFIX = 'forum';
const MAX_ATLAS = 4096;
const SCALES = [1, 2] as const;
const PADDING = 2;

const errors: string[] = [];
const fail = (msg: string) => errors.push(msg);

/** Every file under `dir`, as posix paths relative to `dir`. */
function walk(dir: string, base = dir): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = join(dir, e.name);
    return e.isDirectory() ? walk(full, base) : [relative(base, full).split('\\').join('/')];
  });
}

// ---- a minimal SVG reader (the delivery is plain, machine-written SVG: no text, defs or CSS) ------

interface El {
  tag: string;
  /** Raw attribute text, as written. */
  attrs: string;
  children: El[];
}

function parseSvg(text: string, file: string): El {
  const root: El = { tag: '#root', attrs: '', children: [] };
  const stack: El[] = [root];
  const tag = /<(\/?)([a-zA-Z][\w:-]*)((?:\s+[^\s=>/]+\s*=\s*"[^"]*")*)\s*(\/?)>/g;
  for (let m = tag.exec(text); m; m = tag.exec(text)) {
    const [, close, name, attrs, selfClose] = m;
    if (close) {
      const top = stack.pop();
      if (!top || top.tag !== name) throw new Error(`${file}: unbalanced </${name}>`);
      continue;
    }
    const el: El = { tag: name!, attrs: attrs ?? '', children: [] };
    stack[stack.length - 1]!.children.push(el);
    if (!selfClose) stack.push(el);
  }
  const svg = root.children.find((c) => c.tag === 'svg');
  if (!svg || stack.length !== 1) throw new Error(`${file}: not a single well-formed <svg>`);
  return svg;
}

const attr = (el: El, name: string): string | undefined =>
  new RegExp(`(?:^|\\s)${name}="([^"]*)"`).exec(el.attrs)?.[1];

function viewBoxOf(svg: El, file: string): ViewBox {
  const nums = attr(svg, 'viewBox')
    ?.trim()
    .split(/[\s,]+/)
    .map(Number);
  if (!nums || nums.length !== 4 || nums.some((n) => !Number.isFinite(n)))
    throw new Error(`${file}: missing or bad viewBox`);
  return nums as ViewBox;
}

function findById(el: El, id: string): El | null {
  if (attr(el, 'id') === id) return el;
  for (const c of el.children) {
    const hit = findById(c, id);
    if (hit) return hit;
  }
  return null;
}

/** A drawable shape with the groups around it (their paint and transforms still apply). */
interface Leaf {
  el: El;
  ancestors: El[];
}

function leavesOf(el: El, ancestors: El[] = []): Leaf[] {
  if (el.tag !== 'g') return [{ el, ancestors }];
  return el.children.flatMap((c) => leavesOf(c, [...ancestors, el]));
}

const VAR = /var\(--([a-z]+)\s*,\s*(#[0-9a-fA-F]{3,6})\s*\)/g;

/** The tint slot of a shape: a `var(--slot, …)` in its own or inherited fill or stroke. */
function slotOf(leaf: Leaf, where: string): TintSlot | null {
  for (const paint of ['fill', 'stroke']) {
    let value = attr(leaf.el, paint);
    for (let i = leaf.ancestors.length - 1; value === undefined && i >= 0; i--)
      value = attr(leaf.ancestors[i]!, paint);
    const m = value ? /var\(--([a-z]+)/.exec(value) : null;
    if (!m) continue;
    if (!(TINT_SLOTS as readonly string[]).includes(m[1]!)) {
      fail(`${where}: unknown tint variable --${m[1]}`);
      return null;
    }
    return m[1] as TintSlot;
  }
  return null;
}

/** Attribute text with tint variables resolved: the run's own slot → white, others → their default. */
function resolveVars(attrs: string, slot: TintSlot | null): string {
  return attrs
    .replace(/\s+id="[^"]*"/g, '')
    .replace(/\s+data-[a-z-]+="[^"]*"/g, '')
    .replace(VAR, (_all, name: string, def: string) => (name === slot ? '#ffffff' : def));
}

function emit(el: El, slot: TintSlot | null): string {
  const open = `<${el.tag}${resolveVars(el.attrs, slot)}`;
  if (el.children.length === 0) return `${open}/>`;
  return `${open}>${el.children.map((c) => emit(c, slot)).join('')}</${el.tag}>`;
}

function emitLeaf(leaf: Leaf, slot: TintSlot | null): string {
  let out = emit(leaf.el, slot);
  for (let i = leaf.ancestors.length - 1; i >= 0; i--) {
    const a = leaf.ancestors[i]!;
    out = `<g${resolveVars(a.attrs, slot)}>${out}</g>`;
  }
  return out;
}

/** Splits shapes into back-to-front runs that share a tint slot. */
function runsOf(leaves: Leaf[], where: string): { slot: TintSlot | null; body: string }[] {
  const runs: { slot: TintSlot | null; body: string }[] = [];
  for (const leaf of leaves) {
    const slot = slotOf(leaf, where);
    const last = runs[runs.length - 1];
    const body = emitLeaf(leaf, slot);
    if (last && last.slot === slot) last.body += body;
    else runs.push({ slot, body });
  }
  return runs;
}

// ---- raster jobs (deduplicated by content) --------------------------------------------------------

interface RasterJob {
  name: string;
  svg: string;
  zoom: number;
}
const rasterJobs: RasterJob[] = [];
const rasterBySvg = new Map<string, string>();

function addRaster(name: string, vb: ViewBox, body: string, ppu: number): string {
  const [x, y, w, h] = vb;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${w} ${h}" ` +
    `width="${w}" height="${h}">${body}</svg>`;
  const key = `${ppu}|${svg}`;
  const known = rasterBySvg.get(key);
  if (known) return known;
  rasterBySvg.set(key, name);
  rasterJobs.push({ name, svg, zoom: ppu });
  return name;
}

function layersFor(
  frame: string,
  vb: ViewBox,
  leaves: Leaf[],
  ppu: number,
  where: string,
): FrameLayerRef[] {
  const runs = runsOf(leaves, where);
  if (runs.length === 0) fail(`${where}: no shapes`);
  return runs.map((r, i) => ({ atlas: addRaster(`${frame}~${i}`, vb, r.body, ppu), tint: r.slot }));
}

// ---- rigs (SPEC §12.2) ----------------------------------------------------------------------------

const isPoint = (p: unknown): boolean =>
  Array.isArray(p) && p.length === 2 && p.every((n) => typeof n === 'number' && Number.isFinite(n));

function validateRig(rig: RigDef, file: string) {
  const where = `rig ${rig.id}`;
  if (`rigs/${rig.id}.json` !== file) fail(`${file} has id ${rig.id}`);
  if (!(RIG_IDS as readonly string[]).includes(rig.id)) fail(`${where}: unknown rig id`);
  if (!isPoint(rig.foot)) fail(`${where}: bad foot`);
  if (!(rig.ppu > 0)) fail(`${where}: bad ppu`);
  const views = Object.keys(rig.views).sort();
  if (views.join() !== [...VIEW_IDS].sort().join()) fail(`${where}: views ${views} ≠ ${VIEW_IDS}`);
  const optional = new Set(Object.values(rig.optional ?? {}).flat());
  // Every part of the rig, from every pose.
  const all = new Set<string>();
  for (const v of Object.values(rig.views))
    for (const p of Object.values(v.poses)) Object.keys(p.parts).forEach((n) => all.add(n));
  for (const [view, v] of Object.entries(rig.views)) {
    if (!v.poses[v.defaultPose]) fail(`${where} ${view}: default pose ${v.defaultPose} is missing`);
    for (const [pose, rp] of Object.entries(v.poses)) {
      const at = `${where} ${view}/${pose}`;
      for (const name of all) {
        if (!optional.has(name) && !rp.parts[name]) fail(`${at}: part ${name} is missing`);
      }
      const seen = new Set<string>();
      for (const p of rp.order) {
        if (seen.has(p)) fail(`${at}: order lists ${p} twice`);
        seen.add(p);
        if (!rp.parts[p]) fail(`${at}: order names ${p}, which isn't a part`);
      }
      for (const p of Object.keys(rp.parts))
        if (!seen.has(p)) fail(`${at}: ${p} missing from order`);
      for (const [name, part] of Object.entries(rp.parts)) {
        if (!isPoint(part.pivot) || (part.at !== undefined && !isPoint(part.at)))
          fail(`${at}: part ${name} has a bad pivot/at`);
        if (part.parent !== undefined && !rp.parts[part.parent])
          fail(`${at}: part ${name} has unknown parent ${part.parent}`);
        const chain = new Set<string>([name]);
        for (let p = part.parent; p !== undefined; p = rp.parts[p]?.parent) {
          if (chain.has(p)) {
            fail(`${at}: part ${name} has a parent cycle through ${p}`);
            break;
          }
          chain.add(p);
        }
      }
      for (const [name, a] of Object.entries(rp.attach)) {
        if (!rp.parts[a.part]?.src) fail(`${at}: attach ${name} rides on missing/hidden ${a.part}`);
        if (!isPoint(a.at)) fail(`${at}: attach ${name} has a bad point`);
      }
    }
  }
  for (const [group, parts] of Object.entries(rig.optional ?? {})) {
    if (parts.length === 0) fail(`${where}: optional group ${group} is empty`);
    for (const p of parts) if (!all.has(p)) fail(`${where}: optional ${group} names unknown ${p}`);
  }
}

function buildRigPose(
  rig: RigDef,
  view: (typeof VIEW_IDS)[number],
  pose: string,
  rp: RigPose,
  frames: Record<string, FrameMeta>,
  named: Set<string>,
) {
  const path = join(artRoot, rp.file);
  const at = `rig ${rig.id} ${view}/${pose}`;
  if (!existsSync(path)) {
    fail(`${at}: missing file ${rp.file}`);
    return;
  }
  named.add(rp.file);
  const svg = parseSvg(readFileSync(path, 'utf8'), rp.file);
  const vb = viewBoxOf(svg, rp.file);
  if (vb.join() !== rig.viewBox.join())
    fail(`${at}: ${rp.file} viewBox ${vb} ≠ rig ${rig.viewBox}`);
  for (const [name, part] of Object.entries(rp.parts)) {
    if (!part.src) continue;
    const el = findById(svg, part.src.id);
    if (!el) {
      fail(`${at}: part ${name}: no #${part.src.id} in ${rp.file}`);
      continue;
    }
    let leaves: Leaf[];
    if (part.src.pick) {
      const kids = el.children;
      if (part.src.pick.some((i) => !kids[i])) {
        fail(`${at}: part ${name}: pick ${part.src.pick} out of range in #${part.src.id}`);
        continue;
      }
      leaves = part.src.pick.flatMap((i) => leavesOf(kids[i]!, [el]));
    } else leaves = leavesOf(el);
    const frame = rigFrameName(rig.id, view, pose, name);
    const attach: Record<string, [number, number]> = {};
    for (const [a, def] of Object.entries(rp.attach)) if (def.part === name) attach[a] = def.at;
    frames[frame] = {
      category: 'characters',
      file: rp.file,
      viewBox: rig.viewBox,
      anchor: rig.foot,
      layer: 'world',
      ppu: rig.ppu,
      layers: layersFor(frame, rig.viewBox, leaves, rig.ppu, `${at} part ${name}`),
      ...(Object.keys(attach).length > 0 ? { attach } : {}),
      rig: { id: rig.id, view, pose, part: name },
    };
  }
}

// ---- stage 2: rasterize + pack --------------------------------------------------------------------

interface Raster {
  name: string;
  w: number;
  h: number;
  tx: number;
  ty: number;
  tw: number;
  th: number;
  /** Straight-alpha RGBA of the trim box. */
  rgba: Uint8Array;
}

function rasterize(job: RasterJob, scale: number): Raster {
  const img = new Resvg(job.svg, {
    fitTo: { mode: 'zoom', value: job.zoom * scale },
    font: { loadSystemFonts: false },
  }).render();
  const { width: w, height: h } = img;
  const px = img.pixels; // premultiplied RGBA
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (px[(y * w + x) * 4 + 3]! > 0) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) [x0, y0, x1, y1] = [0, 0, 0, 0]; // fully transparent: keep one pixel
  const tw = x1 - x0 + 1;
  const th = y1 - y0 + 1;
  const rgba = new Uint8Array(tw * th * 4);
  for (let y = 0; y < th; y++) {
    for (let x = 0; x < tw; x++) {
      const s = ((y + y0) * w + (x + x0)) * 4;
      const d = (y * tw + x) * 4;
      const a = px[s + 3]!;
      rgba[d + 3] = a;
      if (a > 0) {
        for (let c = 0; c < 3; c++) rgba[d + c] = Math.min(255, Math.round((px[s + c]! * 255) / a));
      }
    }
  }
  return { name: job.name, w, h, tx: x0, ty: y0, tw, th, rgba };
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 255]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** A minimal RGBA8 PNG encoder (filter 0 rows, zlib). */
function encodePng(w: number, h: number, rgba: Uint8Array): Buffer {
  const chunk = (type: string, data: Uint8Array) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const stride = w * 4 + 1;
  const raw = Buffer.alloc(stride * h);
  for (let y = 0; y < h; y++) raw.set(rgba.subarray(y * w * 4, (y + 1) * w * 4), y * stride + 1);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 6 })),
    chunk('IEND', new Uint8Array(0)),
  ]);
}

interface PackRect {
  width: number;
  height: number;
  x: number;
  y: number;
  r: Raster;
}

/** Packs every raster at one scale into as many ≤ 4096² atlases as it needs. */
function pack(scale: 1 | 2, jobs: RasterJob[]): AtlasFile[] {
  const rasters = jobs.map((j) => rasterize(j, scale));
  const packer = new MaxRectsPacker<PackRect>(MAX_ATLAS, MAX_ATLAS, PADDING, {
    smart: true,
    pot: false,
    square: false,
    allowRotation: false,
    border: 1,
  });
  packer.addArray(rasters.map((r) => ({ width: r.tw, height: r.th, x: 0, y: 0, r })));
  const out: AtlasFile[] = [];
  packer.bins.forEach((bin, i) => {
    const key = `${ATLAS_PREFIX}@${scale}x-${i}`;
    const W = bin.width;
    const H = bin.height;
    if (W > MAX_ATLAS || H > MAX_ATLAS) fail(`${key}: ${W}×${H} is over ${MAX_ATLAS}²`);
    const img = new Uint8Array(W * H * 4);
    const frames: Record<string, unknown> = {};
    for (const rect of bin.rects) {
      const r = rect.r;
      for (let y = 0; y < r.th; y++) {
        img.set(r.rgba.subarray(y * r.tw * 4, (y + 1) * r.tw * 4), ((rect.y + y) * W + rect.x) * 4);
      }
      frames[r.name] = {
        frame: { x: rect.x, y: rect.y, w: r.tw, h: r.th },
        rotated: false,
        trimmed: r.tw !== r.w || r.th !== r.h,
        spriteSourceSize: { x: r.tx, y: r.ty, w: r.tw, h: r.th },
        sourceSize: { w: r.w, h: r.h },
      };
    }
    const sorted: Record<string, unknown> = {};
    for (const k of Object.keys(frames).sort()) sorted[k] = frames[k];
    const json = {
      frames: sorted,
      meta: {
        app: 'thieves-forum scripts/build-atlases.ts',
        image: `${key}.png`,
        format: 'RGBA8888',
        size: { w: W, h: H },
        scale: String(scale),
      },
    };
    writeFileSync(join(outRoot, 'atlases', `${key}.png`), encodePng(W, H, img));
    writeFileSync(join(outRoot, 'atlases', `${key}.json`), JSON.stringify(json));
    out.push({
      scale,
      key,
      json: `atlases/${key}.json`,
      image: `atlases/${key}.png`,
      frames: Object.keys(sorted).length,
      size: [W, H],
    });
  });
  return out;
}

// ---- the whole build ------------------------------------------------------------------------------

function build(): { manifest: AssetManifest; jobs: RasterJob[] } {
  const files = walk(artRoot);
  const frames: Record<string, FrameMeta> = {};
  const named = new Set<string>();

  const rigs: RigId[] = [];
  for (const file of files.filter((f) => /^rigs\/[^/]+\.json$/.test(f)).sort()) {
    const rig = JSON.parse(readFileSync(join(artRoot, file), 'utf8')) as RigDef;
    validateRig(rig, file);
    rigs.push(rig.id);
    for (const view of VIEW_IDS) {
      const v = rig.views[view];
      if (!v) continue;
      for (const [pose, rp] of Object.entries(v.poses))
        buildRigPose(rig, view, pose, rp, frames, named);
    }
  }
  for (const id of RIG_IDS) if (!rigs.includes(id)) fail(`rigs/${id}.json is missing`);

  const sprites = JSON.parse(readFileSync(join(artRoot, 'sprites.json'), 'utf8')) as SpritesJson;
  for (const [name, s] of Object.entries(sprites.frames)) {
    if (!(SPRITE_CATEGORIES as readonly string[]).includes(s.category))
      fail(`sprite ${name}: unknown category ${s.category}`);
    if (s.file !== `${s.category}/${name}.svg`) fail(`sprite ${name}: file ${s.file} ≠ its name`);
    if (frames[name]) fail(`frame ${name} is defined twice`);
    const path = join(artRoot, s.file);
    if (!existsSync(path)) {
      fail(`sprite ${name}: missing file ${s.file}`);
      continue;
    }
    named.add(s.file);
    const svg = parseSvg(readFileSync(path, 'utf8'), s.file);
    const vb = viewBoxOf(svg, s.file);
    const leaves = svg.children.flatMap((c) => leavesOf(c));
    frames[name] = {
      category: s.category,
      file: s.file,
      viewBox: vb,
      anchor: s.anchor,
      layer: s.layer,
      ppu: s.ppu,
      layers: layersFor(name, vb, leaves, s.ppu, `sprite ${name}`),
      ...(s.attach ? { attach: s.attach } : {}),
    };
  }

  // Every source SVG is named, except the composed references (art README).
  for (const f of files) {
    if (!f.endsWith('.svg') || f.includes('reference')) continue;
    if (!named.has(f)) fail(`${f} isn't named by a rig or sprites.json`);
  }

  const sortedFrames: Record<string, FrameMeta> = {};
  for (const name of Object.keys(frames).sort()) sortedFrames[name] = frames[name]!;
  return {
    manifest: { version: 1, frames: sortedFrames, rigs: rigs.sort(), atlases: [] },
    jobs: [...rasterJobs],
  };
}

const union = (names: Iterable<string>) => {
  const list = [...new Set(names)].sort().map((n) => `  | ${JSON.stringify(n)}`);
  return list.length > 0 ? `\n${list.join('\n')}` : ' never';
};

/** JSON with one frame per line, so the generated file stays readable. */
function formatManifest(m: AssetManifest): string {
  const frames = Object.entries(m.frames).map(
    ([name, f]) => `    ${JSON.stringify(name)}: ${JSON.stringify(f)},`,
  );
  return (
    `{\n  version: ${m.version},\n  frames: {\n${frames.join('\n')}\n  },\n` +
    `  rigs: ${JSON.stringify(m.rigs)},\n  atlases: ${JSON.stringify(m.atlases)},\n}`
  );
}

/** One full run. Returns false on errors (strict runs exit; `--watch` keeps what it could build). */
function run(strict: boolean): boolean {
  errors.length = 0;
  rasterJobs.length = 0;
  rasterBySvg.clear();
  rmSync(outRoot, { recursive: true, force: true });
  mkdirSync(join(outRoot, 'atlases'), { recursive: true });
  let built: ReturnType<typeof build>;
  try {
    built = build();
  } catch (e) {
    fail(String(e));
    built = { manifest: { version: 1, frames: {}, rigs: [], atlases: [] }, jobs: [] };
  }
  const bail = () => {
    console.error(`assets FAILED:\n  ${errors.join('\n  ')}`);
    process.exit(1);
  };
  if (errors.length > 0 && strict) bail();
  const atlases: AtlasFile[] = [];
  for (const scale of SCALES) atlases.push(...pack(scale, built.jobs));
  if (errors.length > 0 && strict) bail();
  const manifest = { ...built.manifest, atlases };
  writeFileSync(
    join(outRoot, 'keys.ts'),
    '// Generated by scripts/build-atlases.ts (`pnpm assets`). Do not edit; gitignored.\n' +
      '// Every frame name in the manifest (rig parts and sprites.json entries) and the atlases.\n\n' +
      `export type FrameName =${union(Object.keys(manifest.frames))};\n\n` +
      `export const atlasFiles = ${JSON.stringify(atlases, null, 2)} as const;\n`,
  );
  writeFileSync(
    join(outRoot, 'manifest.ts'),
    '// Generated by scripts/build-atlases.ts (`pnpm assets`). Do not edit; gitignored.\n' +
      "import type { AssetManifest } from '../src/host/render/types';\n\n" +
      `export const manifest: AssetManifest = ${formatManifest(manifest)};\n`,
  );
  const sizes = atlases.map((a) => `${a.key} ${a.size[0]}×${a.size[1]}`).join(', ');
  const summary =
    `${Object.keys(manifest.frames).length} frames, ${built.jobs.length} rasters, ` +
    `${manifest.rigs.length} rigs; atlases: ${sizes}`;
  if (errors.length > 0) {
    console.warn(
      `assets built with errors (dev fallback shapes cover them):\n  ${errors.join('\n  ')}`,
    );
    return false;
  }
  console.log(`assets ok (${summary})`);
  return true;
}

function main() {
  const watching = process.argv.includes('--watch');
  run(!watching);
  if (!watching) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  watch(artRoot, { recursive: true }, () => {
    clearTimeout(timer);
    timer = setTimeout(() => run(false), 200);
  });
  console.log('assets: watching art/forum/ for changes');
}

main();
