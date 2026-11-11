# Game Gallery — SPEC (v1)

**Status:** Ready for build
**Location:** `apps/gallery`
**URL:** games.fostercurtis.dev

## Purpose
A simple public home page for the phone-controller party games. A visitor sees every available game and what each one is, then clicks through to play. This is the private-testing version: it shares the collection with friends and family. The public catalog with signup, ads and its own domain comes later.

## Assumptions
- `packages/catalog` already exists and is the **only** source of game data. Each entry has id/slug, title, shortDescription, longDescription, image, minPlayers, maxPlayers, status (`live | beta | hidden`) and a launch-URL helper.
- Each game stays on its own fostercurtis.dev subdomain. The gallery only links out to them.
- The brand kit is delivered in `apps/gallery/gallery-brand-kit.zip`: palette, type, the fostercurtis.dev games lockup with its controller animation, a dark-default theme toggle, favicons, the Open Graph image and a 404 page. Game card art comes from the catalog.

## Scope (v1)

### Page structure
One page, top to bottom:
1. **Header:** the brand kit's lockup (links home) and its theme toggle. The site name is **fostercurtis.dev | games** (page title and link previews).
2. **Intro:** one or two sentences on what the collection is.
3. **How it works:** a three-step strip: open a game on a TV or laptop → scan the QR code with your phone → play. No app needed.
4. **Game grid:** one card per game.
5. **Footer:** minimal (name or copyright, link to fostercurtis.dev).

### Game cards
- Show: image, title, player range (e.g. "2–8 players"), shortDescription.
- **Read more:** expands the card in place to show longDescription. It is a native `<details>`/`<summary>` element or an equivalent accessible disclosure, and it can be expanded and collapsed with the keyboard. No pop-up and no page per game.
- longDescription is plain text. Paragraphs are separated by blank lines and rendered as `<p>` elements.
- **Play:** clicking the card's play button (or its title/image) opens the game's launch URL **in the same tab**.
- Order: the order the catalog exports.

### Status handling
- `live`: shown normally.
- `beta`: shown with a "Playtest" badge.
- `hidden`: never rendered, and not present in the built output.

### Device and input
- A normal responsive website: phone, tablet, laptop.
- Fully keyboard-navigable: logical tab order, visible focus styles, every action reachable without a mouse or hover. This is not a TV interface, but it should not block one later.
- Meets basic accessibility: image alt text built from the game title (the catalog has no alt field), sufficient contrast, semantic headings.

### Build and hosting
- Static and prerendered from `packages/catalog` at build time. No runtime data fetching, no server.
- Its own Vercel project, deployed when the gallery or the catalog changes.
- Site-level meta tags: title, description, Open Graph/Twitter card (the brand kit's `og-image.png`).
- **Vercel Web Analytics** turned on, for page views. The Vercel account is on the Hobby plan, which has no custom events, so per-game click counts wait for v2.
- The implementer chooses the framework and tooling, keeping them light and consistent with the monorepo.

### Done when
- All non-hidden catalog games render correctly. Adding a new `game.meta.ts` adds a card with no gallery code changes.
- Read more and Play work by mouse, touch and keyboard.
- Lighthouse scores for accessibility and performance are in the 90s on mobile.
- AGENTS.md and the READMEs are updated (gallery setup, deploy, and "the gallery reads the catalog").

## Out of scope (v1)
Everything listed under Later versions below.

## Later versions

### v2 (on games.fostercurtis.dev)
- **Feedback survey link:** a link to a Google Form, e.g. in the footer and/or the intro.
- **"More games" link inside each game:** a link back to the gallery from each game's title or end screen. It changes each game, not the gallery.
- **Player-count filter:** "We have N people." Worth adding once the collection outgrows one screen.
- **Per-game click counts:** turn on Vercel Web Analytics in each game and read its referrers from games.fostercurtis.dev, or track Play clicks as custom events if the Vercel plan is upgraded.

### Public launch (new domain, TBD)
- Single-domain path routing (`<domain>/play/<game>`) instead of subdomains, done through the catalog's URL helper.
- A landing/sales page with **email signup** for new-release notices, and possibly an **exclusive game for signing up**.
- **Ads** (including the 5-second skippable ad on the phone before the controller appears) and donation links (Patreon or similar).
- **A page per game** for sharing and SEO, if that is worth it then.
- Possibly a publicly hosted catalog JSON file, if anything outside the monorepo (e.g. TV apps) needs it.

## Decision log

| # | Date | Decision | Choice | Why |
| --- | --- | --- | --- | --- |
| 1 | 2026-11-10 | Framework and tooling | Vite + plain TS + the brand kit's plain CSS; no UI framework, no SSG framework, no Tailwind | One page with a handful of cards needs no framework. It matches the repo's Vite tooling and ships almost no JS, which helps Lighthouse. |
| 2 | 2026-11-10 | Prerender | A string renderer (`src/build/render.ts`) called by a Vite plugin (`transformIndexHtml`) fills the grid from `@pcg/catalog` at build time; the client never imports the catalog | Static output with no runtime fetching. Hidden entries and their art can't reach the output through a bundle, and a build test checks it. A new `game.meta.ts` adds a card with no gallery change. |
| 3 | 2026-11-10 | Brand kit | Unpacked read-only: `public/` and `src/brand/` at the kit's paths, `marks/`, `preview.html` and `README.md` in `brand/`; head values (`THEME_INIT`, `theme-color`, OG alt text) injected from the kit files | The kit comes from the brand designer. Injecting from its files means the page can't drift from it. |
| 4 | 2026-11-10 | Keyboard | One stop per game for the game itself: the image and title links are out of the tab order, so each card has two stops, Read more and Play (named `Play <title>`) | The kit README's intent. Fewer stops make the grid quick to tab through, and every action stays reachable. |
| 5 | 2026-11-10 | Analytics | Vercel Web Analytics page views only, injected in production builds; no custom events | The account is on Hobby, which has no custom events. Per-game click counts wait for v2. |
