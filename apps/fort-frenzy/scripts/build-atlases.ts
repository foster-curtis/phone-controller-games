// Asset pipeline (SPEC §15.10), run by `pnpm assets` before dev, build, typecheck and test.
// Stage 1 (FF1): for every theme under art/, writes into the gitignored generated/ folder
//   - generated/manifest.ts: every frame (rig parts and sprites.json entries) with its category,
//     view/pose, layer, anchor, viewBox, tint and attach points; every rig id; every icon id;
//   - generated/<theme>/icons.svg: the phones' inline icon sprite (a <symbol> per icon, the
//     `.glyph`/`.glow` groups kept so CSS can glow them);
//   - generated/<theme>/portraits/<rig>-body.svg and -mask.svg: each class's front-view rest pose,
//     and its visible color parts alone as an alpha mask CSS tints with the player color (§15.4).
// Fails if an SVG outside review/ and icons/ isn't named by a rig or sprites.json, or a named file
// is missing, and validates every rig (§15.2: parts in every view and pose, `order` = parts, parents,
// optional groups and attach points resolve).
// Stage 2 (FF3): rasterizes every frame (and its `<frame>@unlit` variant when it has
// `class="glow"` groups) plus every icon and badge tile with resvg at 1× and 2×, the review-only
// glow filters stripped, trims and packs them into Phaser JSON-hash atlases of at most 4096²
// (several per scale when they don't fit), and writes
//   - generated/atlases/<theme>@<s>x-<i>.png / .json;
//   - generated/keys.ts: the frame and icon names as string unions (typed keys for the renderer)
//     and the atlas list.
// `--watch` (dev) rebuilds on art changes and only warns: the renderer's dev-only fallback shapes
// cover a missing frame. Every other run (build, test, typecheck) fails instead.
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
import { Resvg } from '@resvg/resvg-js';
import { MaxRectsPacker } from 'maxrects-packer';
import { dirname, join, posix, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { THEME_IDS, type ThemeId } from '../src/shared/ids';
import {
  FRAME_CATEGORIES,
  ICON_SYMBOL_PREFIX,
  isPosed,
  type AssetManifest,
  type FrameCategory,
  type FrameMeta,
  type PortraitFiles,
  type RigDef,
  type RigPoses,
  type RigView,
  type SpritesJson,
  type ThemeAssets,
  type ViewBox,
  type ViewId,
} from '../src/themes/types';

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const artRoot = join(appRoot, 'art');
const outRoot = join(appRoot, 'generated');

const errors: string[] = [];
const fail = (msg: string) => errors.push(msg);

/** Every file under `dir`, as posix paths relative to `dir`. */
function walk(dir: string, base = dir): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = join(dir, e.name);
    return e.isDirectory() ? walk(full, base) : [relative(base, full).split('\\').join('/')];
  });
}

interface Svg {
  viewBox: ViewBox;
  inner: string;
}

// ---- rig validation (§15.2) ---------------------------------------------------------------------

function validateRig(theme: ThemeId, rig: RigDef) {
  const where = `${theme}: rig ${rig.id}`;
  const allParts = new Set<string>();
  const views = Object.entries(rig.views) as [ViewId, RigView | RigPoses][];
  if (views.length === 0) fail(`${where} has no views`);
  for (const [view, v] of views) {
    if (isPosed(v) && !v.poses[v.defaultPose])
      fail(`${where} ${view}: default pose ${v.defaultPose} is missing`);
    const sets: [string | undefined, RigView][] = isPosed(v)
      ? Object.entries(v.poses)
      : [[undefined, v]];
    for (const [pose, rv] of sets) {
      const at = `${where} ${view}${pose ? '/' + pose : ''}`;
      const parts = Object.keys(rv.parts);
      parts.forEach((p) => allParts.add(p));
      if (!isPoint(rv.foot)) fail(`${at}: bad foot`);
      // `order` lists every part exactly once (§2.4 full-size rule: hidden parts included).
      const seen = new Set<string>();
      for (const p of rv.order) {
        if (seen.has(p)) fail(`${at}: order lists ${p} twice`);
        seen.add(p);
        if (!rv.parts[p]) fail(`${at}: order names ${p}, which isn't a part`);
      }
      for (const p of parts) if (!seen.has(p)) fail(`${at}: part ${p} is missing from order`);
      for (const [name, part] of Object.entries(rv.parts)) {
        const expected = [rig.id, view, ...(pose ? [pose] : []), name].join('/');
        if (part.frame !== expected) fail(`${at}: part ${name} frame ${part.frame} ≠ ${expected}`);
        if (!isPoint(part.pivot) || !isPoint(part.at))
          fail(`${at}: part ${name} has a bad pivot/at`);
        if (part.parent !== undefined && !rv.parts[part.parent])
          fail(`${at}: part ${name} has unknown parent ${part.parent}`);
        // Parents form a tree: walking up never revisits a part.
        const chain = new Set<string>([name]);
        for (let p = part.parent; p !== undefined; p = rv.parts[p]?.parent) {
          if (chain.has(p)) {
            fail(`${at}: part ${name} has a parent cycle through ${p}`);
            break;
          }
          chain.add(p);
        }
      }
      for (const [name, a] of Object.entries(rv.attach ?? {})) {
        if (!rv.parts[a.part]) fail(`${at}: attach ${name} rides on unknown part ${a.part}`);
        if (!isPoint(a.at)) fail(`${at}: attach ${name} has a bad point`);
      }
    }
  }
  for (const [group, parts] of Object.entries(rig.optional ?? {})) {
    if (parts.length === 0) fail(`${where}: optional group ${group} is empty`);
    for (const p of parts)
      if (!allParts.has(p)) fail(`${where}: optional group ${group} names unknown part ${p}`);
  }
}

const isPoint = (p: unknown): boolean =>
  Array.isArray(p) && p.length === 2 && p.every((n) => typeof n === 'number' && Number.isFinite(n));

// ---- stage 2: rasterize + pack (§15.10) ---------------------------------------------------------

/** Pixels per sprite unit at 1×: a tile is 80 units and 48 px wide (§2.5). */
const FRAME_ZOOM = 0.6;
/** Icons: 24-unit glyphs and 52-unit tiles at 1 px per unit at 1× (world-UI badges, §15.4). */
const ICON_ZOOM = 1;
const UNLIT_SUFFIX = '@unlit';
const ICON_FRAME_PREFIX = 'icons/';
const MAX_ATLAS = 4096;
const SCALES = [1, 2] as const;
const PADDING = 2;

interface RasterJob {
  name: string;
  svg: string;
  zoom: number;
}
const rasterJobs = new Map<ThemeId, RasterJob[]>();

/** The file as it ships: review-only glow filters (`#glow`, `#glowU`, `#glowS`) stripped. */
function shippable(text: string): string {
  return text
    .replace(/\s*filter="url\(#glow[US]?\)"/g, '')
    .replace(/<filter\b[^>]*\bid="glow[US]?"[^>]*>[\s\S]*?<\/filter>/g, '');
}

// The unlit variant: every color in a `class="glow"` group becomes its side's dark shade (§2.5
// "shade"): violet-hued glow (the Iron Tide) → #2a2340, everything else (ours) → #3c4452.
const OURS_DARK = '#3c4452';
const THEIRS_DARK = '#2a2340';
const INK = '#0d0f12';

function darkShadeFor(hex: string): string {
  const full = hex.length === 4 ? [...hex.slice(1)].map((c) => c + c).join('') : hex.slice(1);
  const n = parseInt(full, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return b > r && b > g ? THEIRS_DARK : OURS_DARK;
}

/** Recolors every `class="glow"` group (nested groups included) to the dark shade. */
function unlit(text: string): string {
  let out = '';
  let i = 0;
  const open = /<g\b[^>]*\bclass="[^"]*\bglow\b[^"]*"[^>]*>/g;
  for (let m = open.exec(text); m; m = open.exec(text)) {
    // The matching </g>, counting nested groups.
    let depth = 1;
    let j = text.length;
    const tags = /<g\b[^>]*?(\/?)>|<\/g>/g;
    tags.lastIndex = m.index + m[0].length;
    for (let t = tags.exec(text); t; t = tags.exec(text)) {
      if (t[0] === '</g>') depth--;
      else if (t[1] !== '/') depth++;
      if (depth === 0) {
        j = t.index + t[0].length;
        break;
      }
    }
    const group = text
      .slice(m.index, j)
      .replace(
        /\b(fill|stroke|stop-color)="(#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3})"/g,
        (all, attr: string, hex: string) =>
          hex.toLowerCase() === INK ? all : `${attr}="${darkShadeFor(hex)}"`,
      );
    out += text.slice(i, m.index) + group;
    i = j;
    open.lastIndex = j;
  }
  return out + text.slice(i);
}

interface Raster {
  name: string;
  /** Untrimmed size in px. */
  w: number;
  h: number;
  /** Trim box inside the untrimmed frame. */
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

interface AtlasFile {
  theme: ThemeId;
  scale: 1 | 2;
  key: string;
  /** Paths relative to generated/. */
  json: string;
  image: string;
  frames: number;
  size: [number, number];
}

interface PackRect {
  width: number;
  height: number;
  x: number;
  y: number;
  r: Raster;
}

/** Packs one theme at one scale into as many ≤ 4096² atlases as it needs (§15.10 risk fallback). */
function packTheme(theme: ThemeId, scale: 1 | 2, jobs: RasterJob[]): AtlasFile[] {
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
    const key = `${theme}@${scale}x-${i}`;
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
        app: 'fort-frenzy scripts/build-atlases.ts',
        image: `${key}.png`,
        format: 'RGBA8888',
        size: { w: W, h: H },
        scale: String(scale),
      },
    };
    writeFileSync(join(outRoot, 'atlases', `${key}.png`), encodePng(W, H, img));
    writeFileSync(join(outRoot, 'atlases', `${key}.json`), JSON.stringify(json));
    out.push({
      theme,
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

const union = (names: Iterable<string>) => {
  const list = [...new Set(names)].sort().map((n) => `  | ${JSON.stringify(n)}`);
  return list.length > 0 ? `\n${list.join('\n')}` : ' never';
};

/** generated/keys.ts: typed frame/icon names (the renderer's only way to name a frame) + atlases. */
function writeKeys(m: AssetManifest, atlases: AtlasFile[]) {
  const themes = Object.values(m.themes);
  const frames = themes.flatMap((t) => Object.keys(t.frames));
  const icons = themes.flatMap((t) => [...t.icons, ...t.tiles]);
  writeFileSync(
    join(outRoot, 'keys.ts'),
    '// Generated by scripts/build-atlases.ts (`pnpm assets`). Do not edit; gitignored.\n' +
      '// Every frame and icon name any theme ships, and the packed atlases (paths under generated/).\n\n' +
      `export type FrameName =${union(frames)};\n\n` +
      `export type IconName =${union(icons)};\n\n` +
      `/** Atlas frame name prefixes: \`<frame>${UNLIT_SUFFIX}\`, \`${ICON_FRAME_PREFIX}<icon>\`. */\n` +
      `export const UNLIT_SUFFIX = ${JSON.stringify(UNLIT_SUFFIX)};\n` +
      `export const ICON_FRAME_PREFIX = ${JSON.stringify(ICON_FRAME_PREFIX)};\n\n` +
      `export const atlasFiles: readonly {\n  theme: string;\n  scale: 1 | 2;\n  key: string;\n  json: string;\n  image: string;\n  frames: number;\n  size: readonly [number, number];\n}[] = ${JSON.stringify(atlases, null, 2)};\n`,
  );
}

/** Splits an SVG file into its viewBox and inner markup (our art has one root <svg>, no prolog). */
function readSvg(file: string): Svg {
  const text = readFileSync(file, 'utf8').trim();
  const m = /^(?:<\?xml[^>]*\?>\s*)?<svg\b([^>]*)>([\s\S]*)<\/svg>$/.exec(text);
  if (!m) throw new Error(`${file}: not a single <svg> element`);
  const vb = /\bviewBox="([^"]+)"/.exec(m[1]!)?.[1];
  const nums = vb
    ?.trim()
    .split(/[\s,]+/)
    .map(Number);
  if (!nums || nums.length !== 4 || nums.some((n) => !Number.isFinite(n)))
    throw new Error(`${file}: missing or bad viewBox`);
  // Review-only glow filters never ship (§15.10).
  const inner = m[2]!.replace(/\s*filter="url\(#glow[US]?\)"/g, '');
  return { viewBox: nums as ViewBox, inner };
}

const hasGlow = (svgText: string) => /class="[^"]*\bglow\b[^"]*"/.test(svgText);

function frameCategory(file: string): FrameCategory | null {
  const top = file.split('/')[0]!;
  return (FRAME_CATEGORIES as readonly string[]).includes(top) ? (top as FrameCategory) : null;
}

/** The view's single part set: a posed view uses `pose` (default: its default pose). */
function viewOf(rig: RigDef, view: ViewId, pose?: string): RigView | null {
  const v = rig.views[view];
  if (!v) return null;
  return isPosed(v) ? (v.poses[pose ?? v.defaultPose] ?? null) : v;
}

function buildTheme(theme: ThemeId): ThemeAssets {
  const dir = join(artRoot, theme);
  const outDir = join(outRoot, theme);
  const files = walk(dir);
  const frames: Record<string, FrameMeta> = {};
  const named = new Set<string>();
  /** Frame name (path under its category folder, no .svg) → file. */
  const svgByName = new Map<string, string>();
  for (const f of files) {
    if (f.endsWith('.svg') && frameCategory(f)) svgByName.set(f.replace(/^[^/]+\/|\.svg$/g, ''), f);
  }

  const addFrame = (name: string, meta: FrameMeta) => {
    if (frames[name]) fail(`${theme}: frame ${name} is defined twice`);
    const path = join(dir, meta.file);
    if (!existsSync(path)) {
      fail(`${theme}: frame ${name} → missing file ${meta.file}`);
      return;
    }
    meta.glow = hasGlow(readFileSync(path, 'utf8'));
    frames[name] = meta;
    named.add(meta.file);
  };

  // Rig parts: '<rig>/<view>/<part>' or '<rig>/<view>/<pose>/<part>' (§15.2).
  const rigs: Record<string, RigDef> = {};
  for (const file of files.filter((f) => /^rigs\/[^/]+\.json$/.test(f)).sort()) {
    const rig = JSON.parse(readFileSync(join(dir, file), 'utf8')) as RigDef;
    if (`rigs/${rig.id}.json` !== file) fail(`${theme}: ${file} has id ${rig.id}`);
    rigs[rig.id] = rig;
    validateRig(theme, rig);
    for (const [view, v] of Object.entries(rig.views) as [ViewId, RigDef['views'][ViewId]][]) {
      if (!v) continue;
      const sets: [string | undefined, RigView][] = isPosed(v)
        ? Object.entries(v.poses)
        : [[undefined, v]];
      for (const [pose, rv] of sets) {
        for (const [part, p] of Object.entries(rv.parts)) {
          const file = svgByName.get(p.frame);
          if (!file) {
            fail(`${theme}: rig ${rig.id} part ${p.frame} has no SVG`);
            continue;
          }
          const attach: Record<string, [number, number]> = {};
          for (const [name, a] of Object.entries(rv.attach ?? {})) {
            if (a.part === part) attach[name] = a.at;
          }
          addFrame(p.frame, {
            category: frameCategory(file)!,
            file,
            viewBox: rig.viewBox,
            anchor: rv.foot,
            layer: 'world',
            tint: p.tint === 'player',
            ...(Object.keys(attach).length > 0 ? { attach } : {}),
            glow: false,
            rig: {
              id: rig.id,
              view,
              ...(pose !== undefined ? { pose } : {}),
              part,
              emissive: p.emissive === true,
            },
          });
        }
      }
    }
  }

  // Everything else: sprites.json (§15.2).
  const sprites = JSON.parse(readFileSync(join(dir, 'sprites.json'), 'utf8')) as SpritesJson;
  for (const [name, s] of Object.entries(sprites.frames)) {
    if (s.file !== `${s.category}/${name}.svg`)
      fail(`${theme}: sprite ${name} file ${s.file} doesn't match its name`);
    addFrame(name, {
      category: s.category,
      file: s.file,
      viewBox: s.viewBox,
      anchor: s.anchor,
      layer: s.layer,
      tint: s.tint,
      ...(s.attach ? { attach: s.attach } : {}),
      glow: false,
    });
  }

  // Every source SVG outside review/ and icons/ must be named (§15.10).
  for (const f of files) {
    if (!f.endsWith('.svg') || f.startsWith('review/') || f.startsWith('icons/')) continue;
    if (!frameCategory(f)) fail(`${theme}: ${f} is outside the category folders`);
    else if (!named.has(f)) fail(`${theme}: ${f} isn't named by a rig or sprites.json`);
  }

  // Icon sprite (§2.6, §15.4).
  const iconFiles = files.filter((f) => /^icons\/[^/]+\.svg$/.test(f)).sort();
  const allIcons = iconFiles.map((f) => posix.basename(f, '.svg'));
  const tiles = allIcons.filter((id) => id.startsWith('badge-tile'));
  const icons = allIcons.filter((id) => !id.startsWith('badge-tile'));
  const symbols = iconFiles.map((f) => {
    const { viewBox, inner } = readSvg(join(dir, f));
    const id = ICON_SYMBOL_PREFIX + posix.basename(f, '.svg');
    return `<symbol id="${id}" viewBox="${viewBox.join(' ')}">${inner}</symbol>`;
  });
  mkdirSync(outDir, { recursive: true });
  writeFileSync(
    join(outDir, 'icons.svg'),
    `<svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style="display:none">\n${symbols.join('\n')}\n</svg>\n`,
  );

  // Class portraits: every rig with a `class-<rig>` icon (§15.4).
  const portraits: Record<string, PortraitFiles> = {};
  mkdirSync(join(outDir, 'portraits'), { recursive: true });
  for (const rig of Object.values(rigs)) {
    if (!icons.includes(`class-${rig.id}`)) continue;
    const front = viewOf(rig, 'front');
    if (!front) {
      fail(`${theme}: class rig ${rig.id} has no front view`);
      continue;
    }
    const files = writePortrait(rig, front, join(outDir, 'portraits'), (frame) => {
      const f = svgByName.get(frame);
      return f ? join(dir, f) : null;
    });
    portraits[rig.id] = {
      body: `${theme}/portraits/${files.body}`,
      mask: `${theme}/portraits/${files.mask}`,
    };
  }

  const sortedFrames: Record<string, FrameMeta> = {};
  for (const name of Object.keys(frames).sort()) sortedFrames[name] = frames[name]!;

  // Stage 2 inputs: every frame (lit, plus @unlit when it has glow groups), then icons and tiles.
  const jobs: RasterJob[] = [];
  for (const [name, meta] of Object.entries(sortedFrames)) {
    const text = shippable(readFileSync(join(dir, meta.file), 'utf8'));
    jobs.push({ name, svg: text, zoom: FRAME_ZOOM });
    if (meta.glow) jobs.push({ name: name + UNLIT_SUFFIX, svg: unlit(text), zoom: FRAME_ZOOM });
  }
  for (const f of iconFiles) {
    const text = shippable(readFileSync(join(dir, f), 'utf8'));
    jobs.push({ name: ICON_FRAME_PREFIX + posix.basename(f, '.svg'), svg: text, zoom: ICON_ZOOM });
  }
  rasterJobs.set(theme, jobs);
  return {
    theme,
    frames: sortedFrames,
    rigs: Object.keys(rigs).sort(),
    icons,
    tiles,
    iconSprite: `${theme}/icons.svg`,
    portraits,
  };
}

// Recolors anything to black or white, keeping alpha (mask building blocks).
const TO_BLACK = '0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0';
const TO_WHITE = '0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 1 0';

/**
 * Front view, rest pose, optional groups off. Parts share the rig's viewBox, so they stack with no
 * offsets. The body draws color parts white (`currentColor`), so multiplying the player color over
 * the mask tints them. The mask is each color part minus every part drawn after it.
 */
function writePortrait(
  rig: RigDef,
  view: RigView,
  outDir: string,
  fileOf: (frame: string) => string | null,
): { body: string; mask: string } {
  const hidden = new Set(Object.values(rig.optional ?? {}).flat());
  const order = view.order.filter((p) => !hidden.has(p));
  const inner = new Map<string, string>();
  for (const part of order) {
    const def = view.parts[part];
    const file = def ? fileOf(def.frame) : null;
    if (!file) {
      fail(`rig ${rig.id}: front part ${part} has no SVG`);
      continue;
    }
    inner.set(part, readSvg(file).inner);
  }
  const [x, y, w, h] = rig.viewBox;
  const open = (extra = '') =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${w} ${h}" width="${w}" height="${h}"${extra}>`;

  const body = `${open(' color="#ffffff"')}${order.map((p) => `<g>${inner.get(p) ?? ''}</g>`).join('')}</svg>\n`;

  const defs: string[] = [
    `<filter id="pcg-black" color-interpolation-filters="sRGB"><feColorMatrix values="${TO_BLACK}"/></filter>`,
    `<filter id="pcg-white" color-interpolation-filters="sRGB"><feColorMatrix values="${TO_WHITE}"/></filter>`,
  ];
  const layers: string[] = [];
  order.forEach((part, i) => {
    if (view.parts[part]?.tint !== 'player') return;
    const above = order.slice(i + 1).map((p) => inner.get(p) ?? '');
    defs.push(
      `<mask id="pcg-m${i}" maskUnits="userSpaceOnUse" x="${x}" y="${y}" width="${w}" height="${h}">` +
        `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#fff"/>` +
        `<g filter="url(#pcg-black)">${above.join('')}</g></mask>`,
    );
    layers.push(
      `<g mask="url(#pcg-m${i})"><g filter="url(#pcg-white)">${inner.get(part) ?? ''}</g></g>`,
    );
  });
  if (layers.length === 0) fail(`rig ${rig.id}: front view has no tint part for the portrait mask`);
  const mask = `${open()}<defs>${defs.join('')}</defs>${layers.join('')}</svg>\n`;

  const names = { body: `${rig.id}-body.svg`, mask: `${rig.id}-mask.svg` };
  writeFileSync(join(outDir, names.body), body);
  writeFileSync(join(outDir, names.mask), mask);
  return names;
}

/** JSON with one frame per line, so the generated file stays readable and diffable. */
function formatManifest(m: AssetManifest): string {
  const themes = Object.values(m.themes).map((t) => {
    const frames = Object.entries(t.frames).map(
      ([name, f]) => `        ${JSON.stringify(name)}: ${JSON.stringify(f)},`,
    );
    const rest = Object.entries(t)
      .filter(([k]) => k !== 'frames')
      .map(([k, v]) => `      ${k}: ${JSON.stringify(v)},`);
    return `    ${JSON.stringify(t.theme)}: {\n      frames: {\n${frames.join('\n')}\n      },\n${rest.join('\n')}\n    },`;
  });
  return `{\n  version: ${m.version},\n  themes: {\n${themes.join('\n')}\n  },\n}`;
}

/** One full run. Returns false on errors (strict runs exit; `--watch` keeps what it could build). */
function run(strict: boolean): boolean {
  errors.length = 0;
  rasterJobs.clear();
  rmSync(outRoot, { recursive: true, force: true });
  mkdirSync(join(outRoot, 'atlases'), { recursive: true });
  const manifest: AssetManifest = { version: 1, themes: {} };
  for (const theme of THEME_IDS) {
    if (!existsSync(join(artRoot, theme))) {
      fail(`art/${theme}/ is missing`);
      continue;
    }
    manifest.themes[theme] = buildTheme(theme);
  }
  if (errors.length > 0 && strict) {
    console.error(`assets FAILED:\n  ${errors.join('\n  ')}`);
    process.exit(1);
  }
  const atlases: AtlasFile[] = [];
  for (const [theme, jobs] of rasterJobs) {
    for (const scale of SCALES) atlases.push(...packTheme(theme, scale, jobs));
  }
  if (errors.length > 0 && strict) {
    console.error(`assets FAILED:\n  ${errors.join('\n  ')}`);
    process.exit(1);
  }
  writeKeys(manifest, atlases);
  writeFileSync(
    join(outRoot, 'manifest.ts'),
    '// Generated by scripts/build-atlases.ts (`pnpm assets`). Do not edit; gitignored.\n' +
      "import type { AssetManifest } from '../src/themes/types';\n\n" +
      `export const manifest: AssetManifest = ${formatManifest(manifest)};\n`,
  );
  const counts = Object.values(manifest.themes).map(
    (t) =>
      `${t.theme}: ${Object.keys(t.frames).length} frames, ${t.rigs.length} rigs, ` +
      `${t.icons.length} icons, ${Object.keys(t.portraits).length} portraits`,
  );
  const sizes = atlases.map((a) => `${a.key} ${a.size[0]}×${a.size[1]}`).join(', ');
  if (errors.length > 0) {
    console.warn(
      `assets built with errors (dev fallback shapes cover them):\n  ${errors.join('\n  ')}`,
    );
    return false;
  }
  console.log(`assets ok (${counts.join('; ')}; atlases: ${sizes})`);
  return true;
}

function main() {
  const watching = process.argv.includes('--watch');
  run(!watching);
  if (!watching) return;
  // Dev: rebuild on any art change (debounced), warning instead of failing.
  let timer: ReturnType<typeof setTimeout> | undefined;
  watch(artRoot, { recursive: true }, () => {
    clearTimeout(timer);
    timer = setTimeout(() => run(false), 200);
  });
  console.log('assets: watching art/ for changes');
}

main();
