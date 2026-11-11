# BUILD_PLAN: Game Gallery

Orchestration plan for building `apps/gallery/SPEC.md` (games.fostercurtis.dev). The orchestrator reads
**only this file**. The milestone subagent reads §2, §4, §8, its milestone entry, and the files the
entry names. Commands are POSIX sh (Git Bash on Windows), run from the repo root. `SPEC §` here means
the section headings of `apps/gallery/SPEC.md`; `PLATFORM §` = `PLATFORM.md`.

The site is one static page, so the plan is one build milestone (**G1**), one user checkpoint (**C1**),
fix milestones for the C1 notes, and a hand-off. It's built on branch `catalog-and-gallery`, which
already holds the `@pcg/catalog` work the gallery reads.

**Site name:** `fostercurtis.dev | games`. It's the page `<title>`, `og:title` and `og:site_name`. The
brand kit's own strings ("fostercurtis.dev games" in the web manifest and the lockup's accessible name)
stay as delivered.

**Inputs already in the repo (read-only for G1):**

- `packages/catalog`: `listedGames()`, `gameUrl()`, `GameMeta`, `catalogCheck()`. Its README documents
  every field, the art files and the `longDescription` paragraph rule.
- Each game's `apps/<game>/game.meta.ts` and its 1200×630 art in `apps/<game>/catalog/`.
- The brand kit `apps/gallery/gallery-brand-kit.zip`, which G1 unpacks. Its `README.md` is the
  styling and wiring guide, and `preview.html` shows every piece, including the exact card markup.

**Brand kit, as unpacked by G1** (every unpacked file is read-only afterwards, like the games' kits):

| Kit path | Goes to | What |
| --- | --- | --- |
| `public/**` | `apps/gallery/public/` | favicons, apple-touch and PWA icons, `site.webmanifest`, `og-image.png` (1200×630) + `og-image.alt.txt`, `404.html` (self-contained "Signal lost"), `fonts/` (Geist 400/600, JetBrains Mono 700, woff2, with licenses) |
| `src/brand/**` | `apps/gallery/src/brand/` | `tokens.css` (palette, semantic tokens, `@font-face`, focus ring, reduced motion), `components.css` (lockup, `.eyebrow`, `.button`, `.text-link`, `.game-card*`, `.pill`, `.read-more`, `.theme-toggle`), `theme.js` (`THEME_INIT`, `initThemeToggle()`), `lockup-animation.js` (`initLockupAnimation()`), `brand.ts` (colors, labels, parent URL) |
| `marks/`, `preview.html`, `README.md` | `apps/gallery/brand/` | reference only: static lockups, the review page, the guide |
| `src/brand/tailwind-theme.css` | not unpacked | Tailwind isn't used (§8) |

**The kit's rules G1 must keep:**

- **Theme:** dark is the default and the OS preference is ignored. `THEME_INIT` runs inline before
  any stylesheet, `<html data-theme="dark">` is in the source, and the toggle stores `theme` in
  localStorage.
- **Amber:** never a text color on a light background.
- **Buttons:** one style, gray at rest and amber on hover or keyboard focus.
- **Playtest pill:** outlined, never filled.
- **Focus ring:** the kit's two-tone ring.
- **Lockup:** the `games` label hides below 360px.
- **Lockup animation:** it never plays under `prefers-reduced-motion`.

## 0. Sessions

The user runs `/clear` between sessions and pastes the §10 kickoff prompt to start each one.

| Session | Runs | Ends at |
| --- | --- | --- |
| S1 | Pre-flight → **G1** (main checkout) → test-runner Acceptance → merge | **C1**: the user reviews the site on a laptop and a phone |
| S2 | C1 notes → **G1-fix-k** → final test-runner pass → print §9 Final handoff | Final handoff printed |

If C1 has no notes, S1 ticks C1 and goes straight to the final pass and the hand-off.

## 1. Pre-flight checklist

Quick blocking checks only (no full gate, no e2e): the test-runner covers those after G1.

| Item | Check command | Blocks |
| --- | --- | --- |
| On `catalog-and-gallery`, clean tree | `test "$(git branch --show-current)" = catalog-and-gallery && test -z "$(git status --porcelain)"` | all |
| Up to date with `main` (AGENTS.md › Git) | `git fetch origin && git log --oneline HEAD..origin/main` prints nothing. If it prints commits: `git merge origin/main`; on a conflict, stop and ask the user. | all |
| No leftover milestone branches | `git branch --list 'build/g1*'` prints nothing (if it does: a crashed session; check §6, then resume or `git branch -D` it) | G1 |
| Brand kit present | `unzip -l apps/gallery/gallery-brand-kit.zip \| grep -q 'gallery-brand-kit/src/brand/tokens.css'` | G1 |
| Node ≥ 22, pnpm 10 | `node -e "process.exit(+process.versions.node.split('.')[0]>=22?0:1)" && pnpm --version \| grep -q '^10\.'` | all |
| npm registry reachable | `npm view @vercel/analytics version && npm view @axe-core/playwright version && npm view lighthouse version` (note the three versions for G1) | G1 |
| Playwright Chromium present | `pnpm --filter @pcg/sunny-side exec playwright install chromium` (no-op if already installed; every app pins the same `@playwright/test`, so the browser is shared) | Acceptance (e2e, Lighthouse) |
| Ports free (4173 5173 5177) | `netstat -ano \| grep LISTENING \| grep -E ':(4173\|5173\|5177) '` prints nothing | Acceptance, C1 |
| Unattended permissions | the session is in auto mode, or `.claude/settings.local.json` allows `Bash(pnpm *)`, `Bash(node *)`, `Bash(npm view *)`, `Bash(unzip *)`, `Bash(git *)` (no push), `Edit`, `Write` | all |

## 2. Branches, merging, verification

- The orchestrator stays on `catalog-and-gallery` in the main checkout. G1 works on `build/g1-gallery`
  cut from it; checkpoint fixes go on `build/g1-fix-<k>`. Nothing runs in parallel, so no worktrees.
- **Subagent flow:** commit as it goes → run its fast checks (below) → tick its §6 items → commit →
  `git rebase catalog-and-gallery` → report. It never runs Playwright or Lighthouse, never merges,
  never pushes.
- **Orchestrator flow:** spawn a `test-runner` (`model: "haiku"`) **on the milestone branch** with the
  milestone's full Acceptance; only failures come back. On a failure, resume the same subagent
  (SendMessage) with the output, then rerun only the failed items. When green:
  `git checkout catalog-and-gallery && git merge --ff-only build/g1-…`, then `git branch -d` it.
- Conflicts in this file's §7 Blockers / §8 Build decisions: keep both sides.
- Nothing is pushed. Pushing the branch and opening the PR are §9 steps for the user.
- **Fast checks** (the subagent runs these itself):
  `pnpm install --frozen-lockfile && pnpm check:gallery && node --test scripts/__tests__/vercel-ignore.test.mjs && pnpm lint && pnpm format:check`
  (`check:gallery` = typecheck, ESLint and Prettier on `apps/gallery`, Vitest, build, `check:changeset`.
  The repo-wide lint and format checks are there because G1 edits root files.)
- **Slow checks** (test-runner only): `pnpm e2e:gallery` (Playwright, Vite on 5177) and
  `pnpm lighthouse:gallery` (production build served by `vite preview` on 4173). Never run both at
  once.
- **Brand check (B):** the unpacked kit is byte-identical to the zip, and no milestone edits it:

  ```sh
  t=$(mktemp -d) && unzip -q apps/gallery/gallery-brand-kit.zip -d "$t" && k="$t/gallery-brand-kit" &&
  diff -r "$k/public" apps/gallery/public &&
  diff -r -x tailwind-theme.css "$k/src/brand" apps/gallery/src/brand &&
  diff -r "$k/marks" apps/gallery/brand/marks && cmp "$k/preview.html" apps/gallery/brand/preview.html &&
  cmp "$k/README.md" apps/gallery/brand/README.md && rm -rf "$t"
  ```

- **Never touched by any milestone:**
  - `packages/**` source (the catalog README is the one exception, see G1), `apps/relay/**`, every
    `apps/<game>/**`, `.github/**`, `tsconfig.base.json`.
  - The unpacked kit, once G1 has unpacked it.
  - Root files, except where the G1 entry lists them.

## 3. Milestones

| # | Milestone (branch slug) | Model | User checkpoint |
| --- | --- | --- | --- |
| G1 | The gallery site, brand kit, wiring, deploy rule, docs (`gallery`) | opus | **C1**: site on a laptop and a phone |
| G1-fix-k | C1 notes (`fix-<k>`) | opus | re-judged in the next session, or by a C1 re-check if the notes were visual |

### G1: The gallery site, brand kit, wiring, deploy rule, docs

- **Goal:** `apps/gallery` (`@pcg/gallery`): one static page prerendered from `@pcg/catalog` at build
  time, styled and wired with the brand kit, built to every SPEC requirement, with the root wiring,
  the Vercel deploy rule, tests and docs.
  - The cards, Read more and Play work with no JavaScript.
  - The shipped script only does what needs JS: the theme toggle, the lockup animation and Vercel
    Web Analytics page views.
- **Read:**
  - `apps/gallery/SPEC.md` (all of it), and this file's header (site name, kit table, kit rules) and §8.
  - The kit, after unpacking: `apps/gallery/brand/README.md`, `apps/gallery/src/brand/*`,
    `apps/gallery/public/site.webmanifest` and `og-image.alt.txt`.
  - In `apps/gallery/brand/preview.html`, only the `<style>` block's page-layout rules (from `.wrap`
    on) and the `<body>` markup. Skip the base64 font and image data.
  - `packages/catalog/README.md`; `packages/catalog/src/{index,games,url,types}.ts` and
    `packages/catalog/src/vite.ts`.
  - The patterns to copy: `apps/say-cheese/{package.json,vite.config.ts,vercel.json,tsconfig.json,playwright.config.ts}`
    and `apps/say-cheese/e2e/helpers.ts`.
  - `scripts/vercel-ignore.mjs` and `scripts/__tests__/vercel-ignore.test.mjs`; `scripts/e2e.mjs`
    lines 40–70 (the `pcg.e2e` rules); root `package.json`; the `ignores` list in `eslint.config.js`;
    `.prettierignore`; AGENTS.md.
- **Owns (write only here):**
  - `apps/gallery/**`, except the unpacked kit after step 1.
  - Root: the `package.json` scripts, `pnpm-lock.yaml`, the `eslint.config.js` `ignores` list and
    `.prettierignore` (one line each per kit folder, nothing else), `scripts/vercel-ignore.mjs` and
    its test.
  - One new `.changeset/*.md`, and the doc edits listed below.
- **Order:**
  1. Unpack the kit per the header table and commit it on its own (`G1: unpack the gallery brand kit`).
  2. Scaffold + root wiring and `pnpm install`.
  3. `render.ts`, test-first.
  4. The prerender plugin + `index.html` + `gallery.css`.
  5. The build tests.
  6. `main.ts` (theme toggle, lockup animation, analytics).
  7. E2E specs and the Lighthouse script (written, not run).
  8. The `vercel-ignore` extension, test-first.
  9. Docs + the changeset + the SPEC decision log.
- **Deliverables:**
  - **Kit unpacked** per the header table, files unchanged (Brand check B).
    - `.prettierignore` gains `apps/gallery/public/`, `apps/gallery/brand/` and `apps/gallery/src/brand/`.
    - `eslint.config.js` `ignores` gains `'apps/gallery/src/brand/**'`. `public/` and `brand/` are
      already ignored for every app.
    - The zip stays in the repo, as with Say Cheese.
  - **Package:** `apps/gallery/package.json`: `@pcg/gallery`, `version` `0.1.0`, private, ESM.
    - Scripts: `dev` (`vite`), `build` (`vite build`), `preview`, `typecheck`, `test` (`vitest run`),
      `e2e` (`playwright test --pass-with-no-tests`), `lighthouse` (`node scripts/lighthouse.mjs`).
    - `dependencies`: `@vercel/analytics` (exact).
    - `devDependencies`, exact or `workspace:*`: `@pcg/catalog`, `@pcg/game-kit` (for `/e2e` only),
      `@playwright/test` (same version as the games), `@axe-core/playwright`, `@types/node`, `jsdom`,
      `typescript`, `vite`, `vitest` (the games' versions).
    - `"pcg": { "e2e": { "relayPort": 8792, "webPort": 5177 } }`: the runner requires both ports,
      and 8792 is a reserved, unused relay port (§8).
  - **Gallery configs:**
    - `tsconfig.json`: extends the base, with `allowImportingTsExtensions` and `allowJs` (no `checkJs`),
      so TS can import the kit's `theme.js` and `lockup-animation.js`. It includes `src`, `e2e`,
      `scripts` and the config files.
    - `vitest.config.ts`: node; jsdom for `src/client/**`.
    - `vercel.json`:
      `{ "cleanUrls": true, "ignoreCommand": "node ../../scripts/vercel-ignore.mjs gallery --catalog" }`.
  - **Root wiring** (`package.json`):
    - `dev:gallery` (`pnpm --filter @pcg/gallery dev`), `dev:lan:gallery` (same, with `--host`),
      `build:gallery`, `e2e:gallery`, `lighthouse:gallery`.
    - `check:gallery` = `pnpm --filter @pcg/gallery typecheck && eslint apps/gallery && prettier --check apps/gallery && pnpm --filter @pcg/gallery test && pnpm build:gallery && pnpm check:changeset`.
    - No relay in any of them. No `check:bundle` / `check:routes`: they apply only to apps with a
      `play.html`, and skip the gallery on their own.
  - **`src/build/render.ts`** (pure TS, no Node or DOM APIs, so it is unit-testable and loadable by
    the Vite config):
    - Helpers:
      - `escapeHtml`.
      - `paragraphs(text)`: split on `/\n\s*\n/`, trim, drop empties, one escaped `<p>` each.
      - `playerRange(min, max)`: `"2–8 players"` with an en dash; `"4 players"` when min = max;
        `"1 player"`.
    - `renderCard(game, { href, imageSrc, eager })` and `renderGrid(games, opts)`. `renderGrid` calls
      `listedGames()` itself, so a hidden entry can't slip through.
    - Card markup is the kit's (`brand/preview.html`, "Game grid"), inside `<li>`:
      - `<article class="game-card" data-game="<id>">`.
      - The image link: `<a class="game-card-image" href tabindex="-1" aria-hidden="true">` holding
        `<img alt="<title> card art" width="1200" height="630" decoding="async">`. Every image is
        `loading="lazy"` except the first card's (`eager`, `fetchpriority="high"`).
      - `.game-card-body`, then `<h3 class="game-card-title"><a href tabindex="-1">` (§8: one
        keyboard stop per game).
      - `.game-card-meta`: the player range as `.eyebrow`, plus `<span class="pill">Playtest</span>`
        for `beta` only.
      - `<p class="game-card-description">` with the short description.
      - `.game-card-actions` holding `<details class="read-more"><summary>`. The summary reads
        "Read more" plus a visually hidden " about <title>", and the long description paragraphs go
        in `.long-description`.
      - The Play link `<a class="button" href aria-label="Play <title>">Play<span aria-hidden="true">→</span></a>`.
    - No `target` anywhere: the game opens in the same tab. Every text value is escaped.
    - `href` = `gameUrl(id)`, never built by hand.
  - **`src/build/prerender.ts`**: the Vite plugin `prerenderGallery({ games? })`. `games` defaults to
    `GAMES`, and only tests override it.
    - `transformIndexHtml` (`order: 'pre'`) replaces `<!--gallery:cards-->` with `renderGrid`.
    - Image paths point at `apps/<id>/<image>`. In build, use a path relative to `index.html`
      (`../<id>/<image>`), which Vite's HTML pipeline hashes into `dist/assets/`. In dev, use
      `/@fs/<abs>`.
    - Head tags come from the kit, so nothing is copied by hand:
      - an inline `<script>` holding `THEME_INIT` from `src/brand/theme.js`, injected `head-prepend`
        so it runs before any stylesheet;
      - `<meta name="theme-color">` from `brand.colors.ink` (`src/brand/brand.ts`);
      - `og:image:alt` and `twitter:image:alt` from `public/og-image.alt.txt` (trimmed, escaped).
    - Imports use explicit `.ts` extensions and erasable TS only: the Vite config loads them through
      Node's type stripping, like `@pcg/catalog/vite`.
  - **`vite.config.ts`:** `plugins: [prerenderGallery(), catalogCheck()]`, `server.port` 5173,
    `preview.port` 4173, single entry `index.html`.
  - **`index.html`:**
    - `<html lang="en" data-theme="dark">`.
    - Head:
      - viewport meta;
      - `<title>fostercurtis.dev | games</title>` and the meta description;
      - `<link rel="canonical" href="https://games.fostercurtis.dev/">`;
      - the kit README's head links: `favicon.ico`, `favicon.svg`, `apple-touch-icon`, `manifest`, and
        preloads for `jetbrains-mono-700` and `geist-400`;
      - Open Graph: `og:type` website, `og:site_name` and `og:title` = the site name,
        `og:description`, `og:url`, `og:image` = `https://games.fostercurtis.dev/og-image.png` with
        `og:image:width` 1200 and `og:image:height` 630;
      - Twitter: `twitter:card` = `summary_large_image` and `twitter:image`;
      - no Google Fonts.
    - Body, following the kit preview's structure:
      - `<a class="skip" href="#main">Skip to content</a>`.
      - The kit's `<header class="site-header">`, copied from the kit README: the lockup (with
        `href="/"`) and the theme toggle.
      - `<main id="main" class="wrap">` with:
        - an intro section: `<h1 class="display">`, `<p class="lede">`, and `<ol class="steps">`
          ("01 Open a game on a TV or laptop", "02 Scan the QR code with your phone", "03 Play. No
          app needed.");
        - a "Games" section: an `<h2>`, then `<ul class="game-grid">` holding `<!--gallery:cards-->`.
      - The kit's `<footer class="site-footer">`: `© 2026 Foster Curtis` and a `.text-link` to
        `https://fostercurtis.dev`.
    - Copy is a DRAFT for C1. The kit preview's headline "Party games on one screen, played with your
      phones." and the manifest's "Party games for a shared screen, played with your phones." are the
      starting points.
    - The module script is `src/client/main.ts`.
  - **Styles:** import order `src/brand/tokens.css`, `src/brand/components.css`, then the
    gallery-owned `src/styles/gallery.css`.
    - `gallery.css` ports the kit preview's page-layout rules: `.wrap`, `.site-header`, `.site-footer`,
      `.skip`, `h1.display`, `.lede`, `.steps` (with its light-theme override), and the section
      spacing.
    - It adds `.game-grid` (the preview's `.pv-cards`, but `minmax(min(100%, 18rem), 1fr)` so 320px
      fits, `align-items: start` so an open card doesn't stretch its row, no list bullets) and a
      `.visually-hidden` utility.
    - Only `var(--…)` from the kit: no color literals.
    - Mobile-first: a 16px minimum side gutter, no horizontal scroll at 320px.
  - **`src/client/main.ts`** (the only shipped JS):
    - On DOM ready, calls `initThemeToggle()` and `initLockupAnimation()` from the kit.
    - In production builds only (`import.meta.env.PROD`), calls `inject()` from `@vercel/analytics`
      for page views.
    - No custom events: the account is on Vercel Hobby (§8).
    - Must not import `@pcg/catalog` or anything under `src/build/`.
  - **Tests (Vitest):**
    - `src/build/__tests__/render.test.ts`:
      - escaping of `<`, `>`, `&` and quotes in every field;
      - paragraph splitting, including `\r\n` and blank lines with whitespace;
      - the player range strings;
      - the pill on `beta` only;
      - hidden entries never rendered, and catalog order kept;
      - every href equals `gameUrl(id)`, and no link has a `target`;
      - the image link is `aria-hidden` and `tabindex="-1"`; the title link is `tabindex="-1"`;
      - the Play label is `Play <title>`, and alt text comes from the title;
      - only the first image is eager.
    - `src/build/__tests__/prerender.test.ts`: runs Vite `build()` on the gallery into a temp
      `outDir`.
      - Fixture case: a fixture `games` reuses the real ids and art but marks one entry `hidden` (with
        a unique probe title and descriptions) and one `beta`. Assert:
        - the listed titles and the pill are present;
        - the hidden entry's probe strings appear in no file in the output;
        - no emitted image is byte-identical to the hidden entry's card art;
        - no `.js` file contains any `shortDescription` (the catalog never reaches the client
          bundle);
        - the head's first script is `THEME_INIT`, and `theme-color` and `og:image:alt` match the
          kit;
        - `404.html`, `og-image.png`, `site.webmanifest` and `fonts/` are copied through.
      - Real-catalog case: builds with the real `GAMES` and asserts one card per `listedGames()`
        entry. This is the "add a `game.meta.ts`, get a card" guarantee.
    - `src/client/__tests__/main.test.ts` (jsdom, `@vercel/analytics` mocked):
      - running `main` wires the toggle: a click flips `data-theme` and the `aria-label`, and stores
        `theme`;
      - it doesn't throw when `localStorage` throws or `matchMedia` is missing;
      - `inject` isn't called outside production.
  - **E2E (written by G1, run by the test-runner):**
    - `playwright.config.ts`: Vite only, on `webPort` 5177, no relay web server; Chromium.
    - `e2e/helpers.ts` exports `test` with the `impact` fixture (copy Say Cheese's; lint requires
      specs to import from it). There's no Google Fonts blocking: the fonts are local.
    - `e2e/gallery.spec.ts`:
      - **Cards:** one per listed game, in catalog order, with title, player range, short description
        and a Play `href` equal to `gameUrl(id)`. Expected values come from `@pcg/catalog`.
      - **Keyboard:**
        - From the top, Tab reaches the skip link, the lockup, the theme toggle, then each card's
          summary and its Play link, in that order (two stops per card).
        - Enter and Space each open and close the details. When open, the long description shows as
          the right number of `<p>`.
        - The focused element shows the kit's focus ring (computed `outline-style` ≠ `none`).
      - **Mouse:**
        - Clicking Read more toggles it.
        - Clicking Play, the title and the image each navigate the same tab to the game URL. Route
          `https://*.fostercurtis.dev/**` to a stub page, then assert `page.url()` and that the
          context still has one page.
      - **Touch:** in a phone context (390×844, `hasTouch`, `isMobile`), `tap()` on Read more and Play
        does the same.
      - **Theme:**
        - The first load is dark even with `colorScheme: 'light'` emulated (the OS is ignored).
        - The toggle switches to light, and a reload stays light.
        - Under `reducedMotion: 'reduce'`, the lockup's `.m-all` and `.brand-lockup-text` have no
          transform 1 s after load.
      - **Layout:** at 320px wide, `scrollWidth ≤ clientWidth`, and the `games` label is hidden at
        359px.
      - **Accessibility:** `@axe-core/playwright` (tags `wcag2a`, `wcag2aa`) finds no violations,
        with every details open, in dark and in light (set `localStorage.theme` before load).
  - **`scripts/lighthouse.mjs`** (gallery-local):
    - Runs `vite build` unless `--no-build` is passed, then starts `vite preview` on 4173
      programmatically (like `scripts/check-routes.mjs`).
    - Runs Lighthouse via `pnpm dlx lighthouse@<exact version from pre-flight>`, with the default
      mobile settings and the categories performance and accessibility. `CHROME_PATH` is Playwright's
      `chromium.executablePath()`, with `--chrome-flags="--headless=new"`.
    - Prints both scores and exits 1 if either is below 90. Always stops the server.
  - **`scripts/vercel-ignore.mjs` extension (`--catalog`)**, with the reason in the header comment: a
    game's `game.meta.ts` or art changing bumps that **game**, not the gallery.
    - `decide()` gains optional `alsoVersions` (package dirs whose `version` change also triggers a
      production build) and `alsoPaths` (extra preview diff paths). Existing calls behave exactly as
      before.
    - With `--catalog`, the CLI fills them from every `apps/*` folder that has a `game.meta.ts`:
      versions `apps/<game>`, and paths `apps/<game>/game.meta.ts` and `apps/<game>/catalog`.
    - Catalog bumps already reach the gallery: `@pcg/catalog` is a dependency, so the gallery gets a
      patch bump with it.
    - Production builds if the gallery's or any game's version changed. An unreadable version builds,
      as today.
    - New `vercel-ignore.test.mjs` cases:
      - production with only a game bump builds; production with no bumps skips;
      - preview with only a `game.meta.ts` or `catalog/` change builds; preview with only a game's
        `src/` change skips;
      - a new game (no `package.json` at the previous commit) builds.
  - **Docs** (Markdown, no changeset needed):
    - `AGENTS.md`:
      - the table row for `apps/gallery`;
      - "Root scripts are per game" becomes per app, and the gallery scripts are listed;
      - "Brand kits are read-only" adds the gallery's `src/brand/**`;
      - "Adding a new game" says the gallery shows it from `GAMES` with no gallery change;
      - the e2e ports line adds the gallery (5177, relay port reserved).
    - `README.md`: a gallery section (run, test, the Lighthouse check, deploy).
    - `PLATFORM.md`:
      - §1 gets a line under the games table naming the gallery and its URL;
      - the §4 tree gets `apps/gallery/`;
      - the §4 frontends bullet names `games.fostercurtis.dev` and says it redeploys when a game's
        version changes;
      - decision-log row 10 records the gallery: a static Vite page prerendered from the catalog, no
        framework, the brand kit read-only, JS only for the theme, the animation and page views, and
        the `--catalog` deploy rule.
    - `packages/catalog/README.md`: drop "coming next", and replace the closing note about the
      Vercel ignore step with what `--catalog` now does.
    - `apps/gallery/SPEC.md`: append a `## Decision log` table (#, date, decision, choice, why) with
      the spec-level choices from §8: Vite with no framework, build-time prerender, kit unpacked
      read-only, one keyboard stop per game, page views only on Hobby.
  - **Changeset:** `pnpm changeset --minor @pcg/gallery -m "Add the game gallery at games.fostercurtis.dev"`.
- **Acceptance** (the test-runner runs all of it on `build/g1-gallery`):
  1. Fast checks (§2) pass.
  2. `pnpm e2e:gallery` passes.
  3. `pnpm lighthouse:gallery` prints performance ≥ 90 and accessibility ≥ 90 and exits 0. Local
     performance is noisy: if only performance misses, rerun once with `--no-build` before reporting a
     failure.
  4. Brand check (B) passes.
  5. `ls apps/gallery/dist/index.html apps/gallery/dist/404.html apps/gallery/dist/og-image.png apps/gallery/dist/fonts/geist-400.woff2`
     succeeds, `grep -c 'class="button"' apps/gallery/dist/index.html` prints the number of
     non-hidden games (3 today), and `grep -c 'fostercurtis.dev | games' apps/gallery/dist/index.html`
     prints at least `1`.
  6. `grep -rnE "#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(" apps/gallery/src apps/gallery/index.html | grep -v 'apps/gallery/src/brand/' | grep -v __tests__`
     prints nothing (colors only from the kit).
  7. `grep -rn "@pcg/catalog\|src/build\|track(" apps/gallery/src/client` prints nothing.
  8. `pnpm affected` lists `@pcg/gallery`.
  9. `git diff --quiet catalog-and-gallery -- packages/catalog/src apps/sunny-side apps/fort-frenzy apps/say-cheese apps/relay .github tsconfig.base.json`
     exits 0 (nothing outside G1's ownership changed).
  10. `grep -l "apps/gallery" AGENTS.md README.md PLATFORM.md` lists all three, and
      `grep -c "^| 10 " PLATFORM.md` prints `1`.
- **Risks / fallbacks:**
  - **Images in the HTML:** Vite may not hash relative `<img src>` added in a `pre`
    `transformIndexHtml`. Fallback: emit each listed card image with `this.emitFile` under a
    content-hashed `fileName` and write that URL. Either way, hidden art must not be emitted (the
    build test checks).
  - **`/@fs/` dev URLs** need the workspace root in `server.fs.allow`. Vite finds
    `pnpm-workspace.yaml` on its own; if not, add the repo root explicitly.
  - **Type stripping:** the Vite config loads TS through Node type stripping, so `src/build/**` uses
    no enums, namespaces or parameter properties, and `.ts` import extensions. `src/build/**` may
    import the kit's `theme.js` and `brand.ts`. If Node can't load `brand.ts` that way (it imports
    nothing, so it should), read the ink color from `tokens.css` instead and log it.
  - **The kit's JS from TS:** if `allowJs` inference trips strict mode or lint, add a gallery-owned
    `src/client/brand-js.d.ts` declaring the two modules' exports. Never edit the kit.
  - **`THEME_INIT` must stay inline:** Vite only rewrites module scripts, so an inline classic
    `<script>` passes through untouched. Check that the built head still starts with it (the build
    test does).
  - **Playwright and the catalog:** if a spec can't load `@pcg/catalog` (TS path imports), add
    `e2e/catalog.ts`, which reads `listedGames()` by running `node` with type stripping and parsing
    JSON.
  - **Analytics locally:** `inject()` runs only in production builds. In local preview, the script
    request to `/_vercel/insights/script.js` 404s; that's harmless and expected.
  - **Lighthouse:**
    - If Chromium from Playwright won't launch under Lighthouse, try `--headless` (old) or a system
      Chrome via `CHROME_PATH`, and log which.
    - If performance is below 90 because of image weight, use the game's `shareImage` (WebP, same
      picture, about 40% of the size) as a `<picture><source type="image/webp">` in front of
      `card.jpg`, and log it.
    - If the lockup animation on load hurts the score, log the numbers as a Blocker for the user
      rather than changing the kit's animation.
  - **CI scope:** changing `scripts/` and root config makes the affected gate run everything. That's
    expected for this branch (it already changed `packages/catalog`).
- **Leave out:**
  - v2 and later items: the survey link, "More games" links in games, the player-count filter,
    per-game click counts.
  - Custom analytics events, any page per game, any client-side data fetching or framework,
    Tailwind.
  - Edits to games, `packages/` source, or the unpacked kit.
- **User checkpoint C1:**
  1. Run `pnpm dev:lan:gallery`. Open `http://localhost:5173/` on the laptop and
     `http://<PC-LAN-IP>:5173/` on a phone.
  2. Check the copy: the tab title "fostercurtis.dev | games", the headline and intro, the three steps
     and the footer.
  3. Check that the lockup plays its controller animation on load and on hover, and that the cards
     look right with the real art. Check that the player ranges and descriptions are correct.
  4. Try Read more by tap, by click and by keyboard (Tab, Enter and Space on the laptop), and check the
     focus ring.
  5. Check that Play, the title and the image open the live game on its subdomain in the same tab.
  6. Check that the theme toggle switches to light, and that a reload remembers it.
  7. Glance at the Lighthouse scores the test-runner reported.

  Notes become G1-fix-k.

### Fix milestones (`G1-fix-k`)

Same model and ownership as G1. **Read:** the C1 notes (verbatim) + G1's Read list, limited to what
the notes touch. **Acceptance:** G1's Acceptance, plus one runnable check per note where possible (a
test, a grep, an e2e assertion). Copy and visual notes are re-judged by the user. A note that would
change the brand kit is a Blocker for the user (the kit comes from the brand designer), not a fix.

## 4. Subagent brief template

```text
You are building {G1 | G1-fix-k}: {name}, of the Game Gallery (apps/gallery).
Goal: {Goal}

Setup: in the main checkout, `git checkout -b {build/g1-gallery | build/g1-fix-<k>} catalog-and-gallery`.
Read ONLY: apps/gallery/BUILD_PLAN.md (header, §2, §4, §8 and the G1 entry in §3); {Read list}.
Read other files only where your Deliverables require it. {For fixes: "User notes: <verbatim notes>"}

Owns (write only here): {Owns}
Deliverables: {Deliverables}
Order: {Order}
Leave out: {Leave out}
Risks / fallbacks: {Risks / fallbacks}

Checks: run only the §2 Fast checks and the Brand check (B) yourself. Write the e2e specs and the
Lighthouse script, but NEVER run Playwright (`pnpm e2e:*`, `playwright test`) or Lighthouse: the
orchestrator's test-runner runs the full Acceptance and sends failures back to you.

Rules:
- Follow AGENTS.md: TS strict, ESM, `import type`, exact-pinned deps with the lockfile, LF endings,
  Prettier, tests in __tests__/ next to the code, and a SPEC citation in every new source file's
  header comment (e.g. `// Card markup (SPEC: Game cards, Status handling)`).
- Take the title, player limits, descriptions, art and URLs only from @pcg/catalog (`listedGames`,
  `gameUrl`); never copy a game's data into the gallery.
- The brand kit (apps/gallery/src/brand/**, public/**, brand/**) is read-only once unpacked. Take
  every color, font and size from its CSS variables and classes, never from literals; follow its
  README's rules (dark default, the amber rule, one button style, outlined pill, focus ring).
- Never touch packages/** source, apps/relay/**, any apps/<game>/**, .github/**, tsconfig.base.json.
  Root files only where your entry lists them.
- A choice the spec and this plan don't cover: pick the simplest option and log one line under
  BUILD_PLAN §8 as `- [{G#}] decision: …, because ….`
- Blocked: write it under BUILD_PLAN §7 Blockers in the given format, commit, stop. Don't guess.
- Done: tick your items in BUILD_PLAN §6 (not "Merged" or "User approved"), commit,
  `git rebase catalog-and-gallery`. Don't merge, don't push.
- Reply in 150 words or fewer: what was built, what was deferred, blockers, branch name.
```

## 5. Orchestrator rules

1. Read only `apps/gallery/BUILD_PLAN.md`. Never read source code. Trust subagent reports and §6.
2. Start every session: read §6 Progress, §7 Blockers and `git log --oneline -10`; then run §1
   pre-flight yourself (quick checks only).
3. One subagent per milestone via the Agent tool, model from §3, in the main checkout, brief from §4.
4. Verify and merge per §2:
   - A `test-runner` (`model: "haiku"`) runs the full Acceptance on the milestone branch.
   - Failures go back to the same subagent, then `git merge --ff-only`.
   - Run Playwright and Lighthouse at most once per round. After a fix, rerun only the failed items.
   - Afterwards, check that ports 4173 and 5177 are free.
5. Stop at C1 and at unresolved Blockers. Tell the user exactly what's needed: the command, the
   URLs, the devices, what to judge, and the Lighthouse scores from the test-runner.
6. C1 notes become one fix subagent (`build/g1-fix-<k>`). If the user approves with no notes, tick
   C1.
7. No extra reviews, audits or re-exploration unless an Acceptance check fails.
8. When every item in §6 is checked, run the final test-runner pass (G1 Acceptance items 1–4 on
   `catalog-and-gallery`), tick it, and print §9 Final handoff.

## 6. Progress checklist

- [ ] Pre-flight passed (S1)
- **G1**
  - [ ] Brand kit unpacked (own commit), Prettier/ESLint ignores, Brand check (B) green
  - [ ] Package, configs, root scripts, `pcg.e2e` ports
  - [ ] `render.ts` + tests (kit card markup)
  - [ ] Prerender plugin (cards, `THEME_INIT`, theme-color, OG alt), `index.html`, `gallery.css`
  - [ ] Hidden-game and real-catalog build tests
  - [ ] `main.ts` (theme toggle, lockup animation, analytics page views) + test
  - [ ] E2E specs (cards, keyboard, mouse, touch, theme, layout, axe) + Lighthouse script
  - [ ] `vercel-ignore --catalog` + tests
  - [ ] Docs (AGENTS, README, PLATFORM #10, catalog README, SPEC decision log) + changeset
  - [ ] Acceptance green (test-runner)
  - [ ] Merged to `catalog-and-gallery`
  - [ ] **User approved C1**
- [ ] Final test-runner pass on `catalog-and-gallery`
- [ ] Final handoff printed

## 7. Blockers

_None._

Format: `- [G#] YYYY-MM-DD: what's blocked, what was tried, what's needed from whom.`

## 8. Build decisions

Format: `- [G#] decision: one line, with the reason.`

- [plan] Tooling: Vite 8 + plain TS + the kit's plain CSS, with no UI framework, no SSG framework and
  no Tailwind (the kit says plain CSS works with whatever the gallery uses; `tailwind-theme.css` isn't
  unpacked). The page is static HTML from a build-time Vite plugin (`transformIndexHtml`). This
  matches the repo's tooling and ships almost no JS, which helps Lighthouse.
- [plan] Prerender = a string renderer (`src/build/render.ts`) called by a Vite plugin. The client
  never imports `@pcg/catalog`, so hidden entries can't reach the output through a bundle, and only
  listed games' art is emitted. A build test enforces both.
- [plan] Brand kit placement: `public/` → `apps/gallery/public/` (served at the root, as the kit's
  absolute `/fonts/…` and `/favicon…` URLs expect). `src/brand/` → `apps/gallery/src/brand/` (kept
  at the kit's path, so its README's instructions apply as written). `marks/`, `preview.html` and
  `README.md` → `apps/gallery/brand/`. All are read-only, like the games' kits, and Brand check (B)
  compares them with the zip.
- [plan] Single source for head values: the prerender plugin injects `THEME_INIT` (from `theme.js`),
  `theme-color` (from `brand.ts`) and the OG alt text (from `og-image.alt.txt`), so `index.html`
  never holds a copy that could drift from the kit.
- [plan] Site name `fostercurtis.dev | games` (user, 2026-11-10) for `<title>`, `og:title` and
  `og:site_name`. The kit's manifest name and the lockup's accessible name ("fostercurtis.dev games")
  are kit files and stay as delivered.
- [plan] Keyboard: one stop per game to the game, as the kit README asks. The image link is
  `aria-hidden` + `tabindex="-1"` (as in the kit). The title link is also `tabindex="-1"`: the kit's
  preview leaves it focusable, but its README's stated intent is one stop per game. Each card has two
  tab stops: Read more and Play (named "Play <title>").
- [plan] Disclosure = native `<details class="read-more">` from the kit: keyboard, touch and screen
  readers work with no JS. The summary keeps the kit's "Read more" label and chevron, plus a visually
  hidden " about <title>".
- [plan] Theme: dark by default, OS preference ignored, a toggle stored in localStorage `theme` (the
  kit's rule, the reverse of fostercurtis.dev). Without JS the page is dark and fully usable; only the
  toggle and the animation need JS.
- [plan] OG image: the kit's `og-image.png` (1200×630, the lockup with "games") at
  `https://games.fostercurtis.dev/og-image.png`. 404: the kit's self-contained `public/404.html`,
  which Vercel serves for unknown paths.
- [plan] Fonts: self-hosted from the kit (`/fonts/*.woff2`, two preloaded), not Google Fonts. That
  means no third-party request and nothing to block in e2e.
- [plan] Analytics: the Vercel account is on Hobby (user, 2026-11-10), which has no custom events. So
  `@vercel/analytics` `inject()` runs in production builds for page views only, with no `track()`
  calls. Per-game click counts move to SPEC v2 (Web Analytics in each game reading its referrers, or
  custom events after an upgrade).
- [plan] Deploy rule: `vercel-ignore.mjs gallery --catalog` builds production when the gallery's
  version or any game's version changed. Meta and art changes always bump their game, because
  `check:changeset` requires a note. It builds previews when the gallery, `packages/`, the lockfile,
  or any game's `game.meta.ts` or `catalog/` changed. The gallery depends on `@pcg/catalog`, so
  catalog bumps patch-bump it.
- [plan] Known gap: the affected gate doesn't rerun the gallery's tests in CI for a meta-only change
  (the gallery doesn't depend on the games). The game's own build still runs `catalogCheck()`, and the
  gallery's Vercel preview (which also runs `catalogCheck()`) rebuilds.
- [plan] E2E ports: web 5177; relay 8792 reserved but unused (the e2e runner and `readE2EConfig` need
  both). The suite runs against the Vite dev server like the games, so coverage-based selection works.
  The built output is tested by the Vitest build tests and the Lighthouse run.
- [plan] Version: `@pcg/gallery` starts at 0.1.0 (pre-launch, like the other packages) with a minor
  note. 1.0.0 is for the public launch on its own domain (SPEC: Later versions).
- [plan] Ports: dev 5173 (shared with the games: one dev server at a time), preview and Lighthouse
  4173 (shared with `check:routes`: never at the same time), e2e 5177.
- [G1] decision: e2e reads the catalog through `e2e/catalog.ts` (a child `node` with type stripping,
  returning `listedGames()` + `gameUrl()` as JSON) from the start, because G1 can't run Playwright to
  confirm its loader handles the catalog's `.ts` imports.
- [G1] decision: the three stylesheets are `<link rel="stylesheet">` tags in `index.html` (kit order),
  not CSS imports in `main.ts`, because then they never depend on JS and dev has no unstyled flash.
- [G1] decision: `main.ts` runs each kit init in its own try/catch, because the kit's
  `initLockupAnimation()` calls `matchMedia` unguarded and must not stop the theme toggle.
- [G1] decision: `render.test.ts` runs in jsdom (`@vitest-environment` docblock) only to parse the
  rendered strings with `DOMParser`; `render.ts` itself uses no DOM.
- [G1] decision: `vercel-ignore.mjs` also exports `catalogOptions()` (the `--catalog` game list) so
  its folder scan is tested against the real repo.

## 9. Final handoff

Manual steps for the user, in order. No secrets are needed.

1. Review `git log --oneline main..catalog-and-gallery`. Push the branch
   (`git push -u origin catalog-and-gallery`) and open a PR to `main`. Wait for `check` and
   `e2e-result` to go green. Shared code and `scripts/` changed, so every game's suite runs.
2. **Vercel:** New Project → import `foster-curtis/phone-controller-games` → Root Directory
   `apps/gallery`, framework Vite (install and build commands default; "Include files outside the
   root directory" on, as for the games) → Deploy. Open the PR's preview URL and check the page.
   - If Deployment Protection is on for previews, PageSpeed can't reach them, so measure on
     production (step 6).
3. Vercel → the gallery project → **Analytics** → Enable (Web Analytics, page views on Hobby).
4. Vercel → Domains → add `games.fostercurtis.dev`; create the DNS CNAME Vercel shows; wait for the
   certificate.
5. Merge the PR. Then merge the **Version Packages** PR the release workflow opens: that's the deploy.
   `@pcg/gallery` 0.1.0 → 0.2.0 triggers its production build; `@pcg/catalog` and the games bump too.
6. **Smoke test** on `https://games.fostercurtis.dev`:
   - Cards render in catalog order, Read more works by tap and keyboard, and Play opens each game in
     the same tab.
   - The theme toggle remembers light, the lockup animates on load, and
     `https://games.fostercurtis.dev/nope` shows "Signal lost".
   - Paste the URL into a chat app to see the link preview (title "fostercurtis.dev | games",
     description, the lockup OG image).
   - Run PageSpeed Insights (mobile) on it: performance and accessibility in the 90s.
   - After a few visits, Vercel Analytics shows page views.

## 10. Kickoff prompt

```text
You are the build orchestrator for the Game Gallery. Read ONLY apps/gallery/BUILD_PLAN.md (never
source code) and follow it exactly.

1. Read §6 Progress, §7 Blockers and `git log --oneline -10` to find where the build stands.
2. Run the §1 pre-flight checks (quick ones only). If anything blocks the next step, stop and tell me
   exactly what to fix.
3. Run the next unchecked milestone with the §4 brief and the §3 model, in the main checkout.
4. Verify and merge per §2 and §5: a haiku test-runner runs the full Acceptance on the milestone
   branch; failures go back to the same subagent; then `git merge --ff-only`.
5. Stop at C1 and at unresolved Blockers. Tell me exactly what to run, open and judge, with the
   Lighthouse scores.
6. If everything in §6 is checked, run the final test-runner pass and print the §9 Final handoff.

{Optional: "C1 approved" / "C1 notes: …"}
```
