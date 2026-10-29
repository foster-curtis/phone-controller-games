// Asset pipeline (SPEC §15.10), run by `pnpm assets` before dev, build, typecheck and test.
// Stage 1 (FF1): for every theme under art/, writes into the gitignored generated/ folder
//   - generated/manifest.ts: every frame (rig parts and sprites.json entries) with its category,
//     view/pose, layer, anchor, viewBox, tint and attach points; every rig id; every icon id;
//   - generated/<theme>/icons.svg: the phones' inline icon sprite (a <symbol> per icon, the
//     `.glyph`/`.glow` groups kept so CSS can glow them);
//   - generated/<theme>/portraits/<rig>-body.svg and -mask.svg: each class's front-view rest pose,
//     and its visible color parts alone as an alpha mask CSS tints with the player color (§15.4).
// Fails if an SVG outside review/ and icons/ isn't named by a rig or sprites.json, or a named file
// is missing. Rasterizing (resvg), the @unlit variants and atlas packing come in FF3.
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
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

function main() {
  rmSync(outRoot, { recursive: true, force: true });
  mkdirSync(outRoot, { recursive: true });
  const manifest: AssetManifest = { version: 1, themes: {} };
  for (const theme of THEME_IDS) {
    if (!existsSync(join(artRoot, theme))) {
      fail(`art/${theme}/ is missing`);
      continue;
    }
    manifest.themes[theme] = buildTheme(theme);
  }
  if (errors.length > 0) {
    console.error(`assets FAILED:\n  ${errors.join('\n  ')}`);
    process.exit(1);
  }
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
  console.log(`assets ok (${counts.join('; ')})`);
}

main();
