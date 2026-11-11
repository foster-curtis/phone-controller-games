# games.fostercurtis.dev — brand kit

The gallery's brand is the fostercurtis.dev brand plus two additions: a muted
**"games" label** in the lockup, and a short **controller animation** on the
mark. The palette, type, mark, favicon, focus ring and 404 are the
same as the main site (source: `foster-curtis/foster-curtis-dev`,
`src/app/globals.css` and `brand/README.md`).

Open `preview.html` to see every piece in context, in both themes.

## The rules

- **Colors:** ink `#14161A`, amber `#E8A33D`, paper `#FFFFFF`, gray `#6B7280`.
  Amber never flips between themes.
- **The amber rule:** amber is never a text color on a light background. Use it
  as a fill, a stroke, or as text on ink only. Amber on white is 2.16:1.
- **Wordmark:** JetBrains Mono bold, lowercase. `fostercurtis` is in ink or
  paper; `.dev` is in amber, always.
- **Lockup:** mark + wordmark, then a hairline divider and the word `games`.
  - The mark and wordmark are exactly the parent lockup and never change.
  - `games` is Geist semibold, lowercase to match the wordmark, in `--muted`
    (7.0:1 on ink, 6.1:1 on paper). It reads as a section label, not a third
    color in the wordmark. It is always visible: it's what tells visitors
    they're on a different site.
  - The divider is 1px by 20px, `--muted` at 50% opacity.
  - Under 360px wide, the divider and label hide before anything else shrinks.
- **Controller animation:** on page load, on hover and every two minutes, the
  mark turns into a phone controller and plays a short scripted bit, then
  turns back. It is about 3.9s long, in five steps:
  1. **Transform** (0–0.45s): the square stretches into a landscape phone. The
     amber center shrinks into the joystick nub, the joystick ring fades in and
     two amber buttons pop in. The text slides right to make room.
  2. **Steer left:** it glides left with the stick pushed left, pauses, tilts
     -8° and taps the lower button.
  3. **Steer right:** it swings across, tilts +8° and double-taps the upper
     button.
  4. **Center and jump:** it settles level, then presses both buttons with a
     small hop.
  5. **Fold back** (3.3–3.9s): it reverses into the original mark.
  
  The rules it is built around:
  - It stays under 5 seconds, so it needs no pause control (WCAG 2.2.2).
  - It only uses transforms and SVG attributes, never layout, so it adds
    nothing to CLS.
  - It never plays under `prefers-reduced-motion`.
  - The two-minute timer skips while the tab is hidden.
  - The controller grows out from both sides of the mark, so the text only
    moves about 13px and still clears the theme toggle on a 375px phone.
  
  Don't add steps without keeping the total under 5s.
- **Default theme is dark.** This is the reverse of the main site. A visitor
  can switch to light with the toggle; the choice is stored under `theme` in
  localStorage. The OS preference is ignored, the same as on the main site.
- **One button style:** secondary gray at rest, amber with ink text on hover or
  keyboard focus. Every card has a Play button, so nothing is amber at rest. The
  grid never shows more than one amber button at a time.
- **Playtest badge (beta games):** a mono uppercase pill with an amber outline
  and foreground text. It is outlined, not filled, so a grid full of betas
  doesn't become a wall of amber.
- **Focus:** the main site's two-tone ring (2px amber inside, 2px foreground
  outside). It passes 3:1 in both themes.

## What's in here

```
public/                 → copy into the gallery's public/ as-is
  favicon.ico           same files as fostercurtis.dev (identical favicon)
  favicon.svg           theme-adaptive SVG favicon
  apple-touch-icon.png
  icon-192.png, icon-512.png, icon-512-maskable.png
  site.webmanifest      dark background and theme color
  og-image.png          1200×630, new: the static lockup with "games"
  og-image.alt.txt      alt text for og:image:alt / twitter:image:alt
  404.html              "Signal lost", self-contained (inline CSS and JS)
  fonts/                Geist 400/600 and JetBrains Mono 700 (woff2, SIL OFL)
src/brand/              → the gallery's styles and helpers
  tokens.css            palette, semantic tokens (dark default), fonts, focus ring
  components.css        lockup, buttons, card, Playtest pill, Read more,
                        theme toggle, signal-lost animation
  lockup-animation.js   initLockupAnimation(): the controller animation
  tailwind-theme.css    optional Tailwind v4 mapping (same token names as the main site)
  theme.js              THEME_INIT inline script and initThemeToggle()
  brand.ts              the same values in TypeScript, for the manifest and theme-color
marks/
  lockup-for-dark-bg.svg       static lockup with "games", text as paths (needs no fonts)
  lockup-for-light-bg.svg
preview.html            review page; fonts and images inlined
```

## Wiring it up (Vite, static)

In `index.html` `<head>`, the theme script goes first so there's no flash of
the wrong scheme:

```html
<script>/* paste THEME_INIT from src/brand/theme.js */</script>
<meta name="theme-color" content="#14161A" />
<link rel="icon" href="/favicon.ico" sizes="any" />
<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
<link rel="manifest" href="/site.webmanifest" />
<link rel="preload" href="/fonts/jetbrains-mono-700.woff2" as="font" type="font/woff2" crossorigin />
<link rel="preload" href="/fonts/geist-400.woff2" as="font" type="font/woff2" crossorigin />
<meta property="og:image" content="https://games.fostercurtis.dev/og-image.png" />
<meta property="og:image:alt" content="(contents of og-image.alt.txt)" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:image" content="https://games.fostercurtis.dev/og-image.png" />
```

The `<html>` element should carry `data-theme="dark"` in the source too.

Import `tokens.css`, then `components.css`. Once the DOM is ready, call
`initThemeToggle()` and `initLockupAnimation()`. Header markup (copied from
`public/404.html`):

```html
<a class="brand-lockup" href="/" aria-label="fostercurtis.dev games — home">
  <span class="brand-mark">
    <svg class="brand-mark-morph" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <g class="m-all">
        <rect class="m-ring" x="6" y="6" width="52" height="52" rx="12"
              fill="none" stroke="currentColor" stroke-width="6"/>
        <circle class="m-stick" cx="8" cy="32" r="10"
                fill="none" stroke="currentColor" stroke-width="4" opacity="0"/>
        <rect class="m-inner" x="24" y="24" width="16" height="16" rx="4" fill="var(--brand-amber)"/>
        <circle class="m-b1" cx="54" cy="37" r="0" fill="var(--brand-amber)"/>
        <circle class="m-b2" cx="67" cy="27" r="0" fill="var(--brand-amber)"/>
      </g>
    </svg>
  </span>
  <span class="brand-lockup-text">
    <span class="brand-wordmark">fostercurtis<span class="brand-wordmark-tld">.dev</span></span>
    <span class="brand-divider" aria-hidden="true"></span>
    <span class="brand-label">games</span>
  </span>
</a>
<button type="button" class="theme-toggle" aria-label="Switch to light mode">…</button>
```

At rest, the SVG renders exactly the parent mark. The joystick ring and the
buttons start invisible (opacity 0, radius 0). If the animation's JS never
loads, nothing is lost.

**404:** Vercel serves `404.html` from the static output automatically. The
page is self-contained apart from `/fonts/` and the favicons, so it needs no
build step. When opened from disk it falls back to system fonts; that's
expected.

## Game cards

Markup and classes are in `preview.html`:

- **Image link:** `aria-hidden` and `tabindex="-1"`, so keyboard users get one
  stop per game, not three. Alt text is built from the title.
- **Title link** goes to the game.
- **Player range** uses the `.eyebrow` style.
- **Playtest pill** for beta games.
- **Description** is the catalog's shortDescription.
- **Read more** is a native `<details>`/`<summary>`. Each blank-line paragraph
  of longDescription becomes a `<p>`.
- **Play** is a `.button` and stays bottom-right even when Read more is open.

## Notes

- The sample game copy in `preview.html` is for review only. Real text comes
  from the catalog.
- The palette is copied from fostercurtis.dev, not shared with it. A palette
  change has to be made in both repos (`tokens.css` and `brand.ts` here).
