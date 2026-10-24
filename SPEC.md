# Sunny Side Shove — SPEC

> Living spec. Only **decided** items go in the body. Open questions live in §9 until we settle them.
> Last updated: 2026-10-22

## 1. Overview

Same-room party game. A shared screen (TV/laptop browser) runs the game; 2–8 phones act as controllers via a web page (room code or QR, no install). Top-down free-for-all: players are fried eggs on a skillet whose edge is heating up, shoving each other off the pan. (Working title was "Bumper Royale".)

First of a planned series (Hold the Line, Dungeon Crew). Build with clean boundaries, but don't extract shared packages until Hold the Line shows what's actually common.

## 2. Architecture (settled)

- **Same-room only.** No remote/online play.
- **Host-authoritative.** Host browser runs the full simulation and rendering.
- **Phones send input state only** (joystick vector + button bits) at ~20–30 Hz or on change. Never discrete move commands.
- **Game-agnostic relay server**: rooms, join codes, host↔phone pairing, message forwarding, reconnects. No game rules. Rooms namespaced by game ID. In-memory only; no accounts, no DB.
- **Transport:** WebSockets. WebRTC DataChannels are a possible later optimization (relay doubles as signaling; WebSocket as fallback, no TURN).

## 3. Phone controller requirements (settled)

- `touch-action: none`, locked viewport
- Wake Lock
- Robust reconnect handling
- Large, simple controls (players watch the TV)
- No reliance on vibration (unsupported on iOS Safari)
- Gyro, if ever used, needs HTTPS + iOS permission prompt

## 4. Hosting & repo (settled)

- **Relay:** Fly.io, one shared-cpu-1x machine, Denver region or nearest.
- **Frontends:** static Vite builds on Vercel, one subdomain of fostercurtis.dev per game.
- **Game domain:** `sunny-side.fostercurtis.dev`. Game ID (relay namespace): `sunny-side`.
- **Relay domain:** `relay.fostercurtis.dev` (custom domain on Fly), shared by all games.
- **Repo:** pnpm monorepo. Day-one layout:

```
apps/
  relay/            Node WebSocket server → Fly.io
  sunny-side/       Vite multi-page app → Vercel
    index.html        host (TV): Phaser + Matter
    play.html         controller (phone): no Phaser
    src/host/  src/controller/  src/shared/
packages/
  net-client/       protocol types + host & controller clients
tsconfig.base.json  pnpm-workspace.yaml
```

- `controller-kit` and `game-kit` start as folders inside the game app; extract after Hold the Line shows what's shared.
- Controller is a separate Vite entry (not a route) so phones never download Phaser. QR → `/play?code=XXXX`.
- Relay lives under `apps/` (deployable), not `packages/`.

## 5. Engine & physics

- **Phaser 4** (current 4.x line) for rendering, scenes, input, tweens, audio, asset loading.
- **Matter.js** as standalone `matter-js` in plain TS (`src/host/sim`, no Phaser imports) for physics: impulse-based collisions with mass, restitution, air friction. Phaser only renders the sim's snapshots.
- Mitigate tunneling/jitter on fast bodies (dash/slam) with physics substeps if needed.
- **Boundary rule:** game state (scores, rounds, player↔input mapping, match flow) lives in plain TS modules outside Phaser scenes. Physics stays swappable (e.g. Rapier) as a contained change.
- Note: most community examples target Phaser 3; expect to translate.

## 6. Game design (v1)

### 6.0 Theme

- **Players:** fried eggs with wobbly yolks (circle-with-a-face art; jiggle on hit).
- **Arena:** a skillet. **Shrink** = the pan's edge overheating and sizzling inward.
- **Ring-out:** sliding off the pan.
- **Slam:** a yolk-first belly flop.
- **Ghosts:** steam wisps; the pulse is a puff of steam.

### 6.1 Scope

- **Players:** 2–8. No bots (2 players = a duel).
- **Arena:** one layout, circular, shrinking. **Starting radius scales with player count** for the round.
- **Scoring:** points per round. Last one standing +3; each knockout you cause +1.
  - **Knockout credit = last touch:** whoever last hit the eliminated player within ~3 s gets the point. No recent hitter → no one scores.
- **Match end:** first to a target score that scales with player count (aim: ~8–10 rounds). Exact targets TBD in tuning.
- **No power-ups or variants** in v1.
- **Ghost hazards are in v1:** eliminated players come back as ghosts who can affect the live round. Design: §6.2.

### 6.2 Ghosts

- **Body:** Matter **sensor** (detects overlaps, no collision response). Passes through living players.
- **Spawn:** **5 s** after elimination.
- **Movement:** free-roaming over the arena via joystick.
- **Ability (press either button):** radial pulse/shove.
  - Weak: ~⅓ of a dash hit. Can tip someone off an edge, can't launch them.
  - Telegraphed: ~0.4 s visible wind-up ring before it fires.
  - Cooldown: ~4 s.
- **No charge as a ghost:** holding does nothing extra; each press is one pulse attempt.
- **Scoring:** ghosts never score. Ghost pulses never count as last touch and **don't reset** the last-touch timer, so the living attacker keeps KO credit.
- **Final 1v1:** ghosts **remain active**.
- All numbers are starting values for tuning.

### 6.3 Match flow

- **Lobby:** players join, enter a **name** (~10 chars, prefilled from last time via `localStorage`), pick a color; host taps Start. Names show on the TV leaderboard/standings.
- **Mid-match joiners** spectate until the next round starts.
- **Eliminated players'** phones switch to ghost controls (§6.2) and show live standings.
- **Disconnected players (mid-round):**
  - Egg **immediately loses all momentum** (velocity zeroed once at disconnect).
  - Their input is reset to neutral, so a stale held joystick can't keep steering.
  - Egg stays in the physics world and **can still be hit** (and knocked out) while the player tries to reconnect.
  - On reconnect within the window, control resumes on the same egg.
  - If the window expires, the egg **stays on the pan as a hittable obstacle** until knocked off (counts as a normal knockout with last-touch credit).
- **Late rejoin (after the window expires):** the relay treats it as a new join. The host matches the returning player by **player key** (§7.1) and **restores their score, name, and color** automatically; they spectate until the next round.

### 6.4 Core mechanics

_All numbers are starting values for tuning._

- **Steering: force-based.** Joystick applies a continuous force; the engine integrates velocity, so steering and knockback combine naturally. Never set velocity directly.
  - Main feel knob: Matter `frictionAir` (per-tick velocity damping), set fairly high for control while keeping hit weight.
- **Facing:** last non-zero stick direction. Used for neutral-stick dashes and visuals.
- **Dash (DASH button, fires on press):** instant impulse in stick direction (facing if neutral). Cooldown ~1.5 s.
- **Slam (SLAM button, hold-and-release):**
  - Hold to charge, up to ~1 s. While charging: reduced movement, vulnerable.
  - Release: large impulse scaled by charge time + brief mass boost (~0.3 s) so the slammer wins the collision.
  - The sim snapshot carries `slamCharge` (0..1) and `slamMax` (still holding at full charge → the max-charge flash).
- **Ring-out:** eliminated when the body's **center** crosses the arena edge.
  - **Ghost knockout:** the sim's `eliminated` event carries `byGhost`: true when no egg gets the credit and a ghost pulse pushed the egg within the same ~3 s credit window (TV text "Knocked out by ghost" instead of "Fell off"). Egg credit always wins. Scoring and last-touch rules are unchanged.
- **Removal:** `Sim.removeEgg(id)` takes a player's egg (and ghost) out of the world at once when they Leave or are removed: no `eliminated` event, no credit, no ghost (a pending ghost spawn is cancelled).
- **Round start:** no input state carries over between rounds; the first input sample of a round only sets the press-counter baseline, so presses made during the countdown never fire.
- **Shrink:** full size for ~10 s → edge pulses as a warning → linear shrink over ~45 s to a minimum radius, then holds until the round ends.

### 6.5 Session leader

- The **first player to join** is the leader. Assigned by the host from join order (a game concept; the relay is unaware).
- Leader's phone shows **Start** in the lobby (enabled at ≥2 players) and **Next round** on the round-results screen.
- The same controls are always available on the host (TV/laptop).
- Other phones show "Waiting for {leader name}…".
- **Match end:** on the winner screen the leader gets **Rematch** (same players, scores reset) and **Back to lobby** (join/leave, change name/color).
- **Handoff:** if the leader disconnects or leaves, leadership passes to the **next-earliest joined connected player**. It does **not** snap back if the original leader returns.

### 6.6 TV presentation

**In-round HUD:**

- Scoreboard (names + points) and round number
- Names over eggs
- Shrink warning (edge pulse)
- **Slam charge:** ring around the charging egg that fills with charge, in the same color as the phone's fill. Egg squashes flatter and the yolk glows hotter as charge builds (anticipation). Brief flash at max charge. The ring is a deliberate tell for opponents.
- **Spectator emoji:** pop in on the side of the screen, float to the top, fade out.
  - Set: 🔥 😂 😱 👏 🍳 (swappable).
  - **1 s cooldown** per spectator; cap of ~12 on screen at once (oldest drops first).
  - Glyphs draw with the system emoji stack `theme.emojiFont` (OS-provided; not a brand.css token).

**Screens:** lobby (QR + room code + joined players), round results, match winner.
Round results and the match winner screen show a **per-round points breakdown** of the round just played (`MatchView.breakdown`, §7.3): for each player who had an egg, the points earned and why (+1 per knockout, naming the victim; +3 survivor) plus who knocked them out (or "fell off"). Not available right after a host refresh.

### 6.7 Phone UI states

- **Joining:** room code (prefilled from QR), connecting.
- **Lobby:** name + color; leader also sees Start.
- **Playing:** floating joystick, DASH, SLAM, **pause button** in the top-right corner above DASH/SLAM.
- **Charging:** while SLAM is held, a tapered arc grows clockwise outside the SLAM button (9:00 to 2:00 over the 1 s gauge time), thickening toward its leading end, in `heat` darkening along its length; it flashes once in `yolk-shine` at full charge and is hidden when SLAM is not held.
- **Eliminated:** "Respawn as a ghost in" with a very large countdown 5 → 1 beneath it; the number pulses slightly on each change.
- **Ghost:** same joystick; the DASH/SLAM pair is replaced by a single grey **PULSE** button (not the player color, not dampened). It sends the dash bit/counter, which the host treats as a ghost pulse.
- **Spectating** (mid-match joiners, late rejoiners): no controller. Scores + round number + an **emoji hotbar of 5** reactions (shown on the TV per §6.6).
- **Round results / match end:** standings; leader sees Next round. Both screens also carry the per-round points breakdown of the round just played (§7.3; the final round on match end).
- **Self-paused:** overlay covering the controller with **Resume** and **Leave game**.
- **Game paused** (host tab hidden, §8): overlay with a note to make sure the host screen is open and connected, plus **Leave game**.
- **Reconnecting:** overlay while the socket recovers.

**Self-pause rules:**

- A player can pause at any time from the pause button.
- **Hold-to-pause** (~0.6 s, with a small ring that fills while holding) to prevent accidental pauses mid-fight.
- Mid-round, a self-paused egg follows the **disconnect rules** (§6.3): stops dead, input zeroed, stays hittable.

**Leave game:**

- The egg stays on the pan as a hittable obstacle (same as an expired disconnect).
- Their slot frees up; their name greys out in the standings for the rest of the match.
- Returning via their player key restores their score (late-rejoin rule, §6.3).

### 6.8 Branding & audio

- Branding is **in v1**, from the brand kit (`apps/sunny-side/src/styles/brand.css`, `public/`, `brand/`). Every visual token (colors incl. the 8 player colors, type scale, spacing, radii, sticker stroke/shadow/tilt) lives in `brand.css` as CSS custom properties, used directly by the controller DOM; `src/shared/theme.ts` mirrors them for Phaser, and `theme.test.ts` fails on drift.
- Brand fonts (Lilita One, Geist, JetBrains Mono) load from Google Fonts per `brand/head.html`, with fallback stacks. Eggs are code-drawn in the mark's style.
- Rebrand = replace the kit files and update `theme.ts` until the parity test passes.
- All audio stays **post-MVP**.

## 7. Protocols

### 7.1 Relay protocol

**Topology:** hub-and-spoke through the host. Phones only talk to the host. The relay stamps `from: playerId` on every forwarded message (phones can't spoof). Host sends to one phone (`to`) or broadcasts (no `to`).

**Encoding:** JSON for all messages in v1. Encode/decode lives in `net-client` so inputs can move to binary later as a contained change.

**Rooms:**

- Created by the host with `{ game, maxPlayers }`. Relay enforces capacity (generic config, not a game rule).
- Codes: 4 letters, unambiguous alphabet (no I/O/0/1), scoped per game ID.
- In-memory only.

**Admission:** relay **auto-admits**. Host has two generic room controls:

- `lock` / `unlock`: while locked, new joins get `room-locked`; reconnects with a valid token still succeed.
- `kick(playerId)`: closes that phone's connection and invalidates its token.

**Identity & reconnect:**

- Phone join → relay issues `playerId` + reconnect token (phone stores it in `sessionStorage`). Rejoin within ~30 s reclaims the same slot.
- **Player key:** a random ID the phone generates and keeps in `localStorage`, scoped to the game ID + room code (`getPlayerKey(code, storage?, game?)`). Sent with every join and passed through to the host. Survives iOS killing the tab (which wipes `sessionStorage`), so the host can recognize a late rejoin. Opaque to the relay.
- Host gets a host token. If the host tab drops/refreshes, the room survives ~60 s; host reclaims it and receives the current roster.
- Relay emits `peer` events (`joined` / `left` / `rejoined`); the host decides game behavior (§6.3).
- **Client reconnect (net-client):** after an unexpected close, status `reconnecting` with exponential backoff (250 ms doubling to a 4 s cap, jitter 75–100%); `visibilitychange`→visible or the window's `online` event retries at once (the window is injectable via `ClientEnv.window`). `kicked` / `no-room` / `room-closed` (and `room-full` / `room-locked`) stop for good: status `closed`, reason in `closeReason`.

**Liveness:** relay-driven heartbeat, ping every ~5 s, drop after ~2 missed (catches sleeping iOS phones that never close the socket).

**Envelope:**

```ts
// client → relay
{ t: "create", game, maxPlayers }      // host
{ t: "reclaim", hostToken }            // host
{ t: "join", game, code, playerKey, token? }   // phone
{ t: "send", to?: playerId, data }     // either side
{ t: "lock" } | { t: "unlock" }        // host
{ t: "kick", playerId }                // host

// relay → client
{ t: "created", code, hostToken }
{ t: "reclaimed", code, roster }
{ t: "joined", playerId, token }
{ t: "peer", event: "joined" | "left" | "rejoined", playerId, playerKey }
{ t: "msg", from, data }
{ t: "kicked" }
{ t: "error", code: "room-full" | "no-room" | "room-locked" | ... }
```

_Shape is indicative; exact fields finalized at implementation._

### 7.2 Controller input format

**Buttons:** two, **DASH** and **SLAM**. Dash fires on press (no tap/hold ambiguity). Ghosts pulse with either button; on the ghost screen the pair is replaced by one grey PULSE button that sends the dash input. On the ghost screen the pair is replaced by one grey PULSE button that sends the dash input.

**Message** (phone → host, inside relay `send.data`):

```ts
[x, y, buttons, dashCount, slamCount];
// x, y: ints −100..100, deadzone applied on the phone
// buttons: bitmask (1 = dash down, 2 = slam down)
// dashCount, slamCount: monotonic press counters
```

- **Press counters** guarantee the host never misses a quick tap that starts and ends between samples: a counter increment = a press event.
- **Send rate:** stick on change, capped at 30 Hz; button changes bypass the cap and send immediately; ~5 Hz keepalive when idle.
- **Slam charge** is timed on the host (button-down → button-up as observed). Jitter (~±30 ms) is acceptable.
- No sequence numbers: WebSockets are ordered. Add them if moving to unordered WebRTC channels.

**Phone layout:**

- Locked to landscape.
- Top banner: filled with the player's color (name in its `-on` color, green connectivity dot to the left of the name); neutral before a color is assigned. The hold-to-pause button sits at its right end.
- Left half: **floating joystick**, always drawn at a resting spot near the bottom-left when idle; a touch anywhere in the left half becomes the stick's center while held, and it returns to the resting spot on release.
- Right half: two full-size touch zones (DASH left column, SLAM right column, no dead area) with round sticker buttons staggered inside them: DASH up and to the left (cream), SLAM down and to the right (yolk). The pads deliberately do **not** use the player color.
- Pause: hold ~0.6 s (ring fills) to pause; the button lives in the banner.

### 7.3 Other game messages

Phone → host (JSON objects; inputs are arrays, so `Array.isArray` distinguishes them):

```ts
{ t: "profile", name, color }          // lobby
{ t: "pause" } | { t: "resume" }
{ t: "emoji", i }                      // index into the 5-emoji set
{ t: "leader", action: "start" | "next" | "rematch" | "lobby" }
{ t: "leave" }
```

Host → phone: the host drives each phone's UI state (§6.7), e.g. `{ t: "screen", screen, ...data }`, sent per phone or broadcast.
Every screen also carries `leaderName` (the session leader's name, or null) so non-leader phones can show "Waiting for {leader}…" (§6.5); it is re-sent when leadership changes.
The `results` and `matchEnd` screens (and the TV's `MatchView`) carry `breakdown?: RoundBreakdown | null` for the round just played: `{ round, players: [{ playerId, name, color, points, total, left, items, out }] }`, players who had an egg only, in standings order; `items` = `{ kind: "ko", victimId, victimName, points }` per knockout credit and `{ kind: "survivor", points }`; `out` = `{ by, byName }` (both null = fell off / no credit) or null if never knocked out. It is null/absent after a host-refresh restore. Exact types: `src/shared/messages.ts`.
_Shape is indicative; exact fields finalized at implementation._

## 8. Game loop

**Model:** fixed 60 Hz simulation + render interpolation.

- The standalone Matter engine never auto-steps; the sim advances it by `1000/60` from our own accumulator in the frame callback.
- **Accumulator:** each frame adds elapsed time, runs as many fixed steps as are owed, carries the remainder.
- **Catch-up cap:** max ~5 steps per frame; drop excess time (prevents the spiral of death after a hitch).
- **Interpolation:** store each moving body's previous position/angle (eggs, ghosts, arena radius). Render at `lerp(prev, curr, alpha)` where `alpha = accumulator / step`. Costs ~1 step (~16 ms) of visual delay.

**Input sampling:**

- Network handler only overwrites a per-player "latest input" record on message arrival.
- Simulation reads those records at the start of each step; it never touches the network.
- Press counters (§7.2) are diffed per step to produce dash/slam events.

**Step order:**

1. Apply inputs (steering forces, dash/slam from counter diffs)
2. Update timers (cooldowns, slam charge, ghost wind-ups, mass boosts)
3. Physics step
4. Post-step checks (last-touch from collision events, ring-outs, arena shrink)
5. Round and score logic

**Host visibility & power:**

- On `visibilitychange` → hidden: pause the round; phones show "Paused". Resume on visible.
- Request a Wake Lock on the host as well as the phones.

## 9. Open questions (in order)

_None. Spec complete and ready for implementation._

## 10. Decision log

| #   | Date       | Decision            | Choice                                                                                                                                           | Why                                                                                                                                                                                                                                              |
| --- | ---------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | 2026-10-22 | Engine + physics    | Phaser 4 + Matter.js                                                                                                                             | Knockback feel is the core; Matter gives mass-correct impulses day one, Phaser covers non-physics boilerplate. Rejected: Arcade (sticky, non-momentum collisions), PixiJS + Rapier (too much plumbing before fun), hand-rolled physics (detour). |
| 2   | 2026-10-22 | v1 scope            | 2–8 players, one scaled circular arena, points w/ last-touch KO credit, scaled target score, no power-ups, ghosts in v1                          | First-to-5 round wins runs 15–20+ rounds at 8 players and rewards passivity; KO points reward bumping. Ghosts keep eliminated players engaged.                                                                                                   |
| 3   | 2026-10-22 | Match flow          | Lobby w/ color pick + host Start; mid-match joiners spectate to next round                                                                       | Simple, no edge cases mid-round.                                                                                                                                                                                                                 |
| 4   | 2026-10-22 | Ghost design        | Free-roaming sensor ghost, telegraphed weak pulse on cooldown, no scoring/credit, 5 s spawn delay                                                | Reuses controller layout; telegraph + no credit limit gang-ups and kingmaking. 5 s delay (Foster) makes eliminations land. Rejected: perimeter ghosts (shoves help players), hazard-droppers (less satisfying, extra system).                    |
| 5   | 2026-10-22 | Ghosts in final 1v1 | Remain active                                                                                                                                    | Chaos is part of the genre; revisit after playtesting if it feels unfair.                                                                                                                                                                        |
| 6   | 2026-10-22 | Core mechanics      | Force-based steering w/ `frictionAir` damping; dash impulse; charged slam w/ mass boost; center-crossing ring-out; hold-then-linear shrink       | Setting velocity directly would erase knockback every tick. Package keeps hits weighty and readable.                                                                                                                                             |
| 7   | 2026-10-22 | Repo layout         | `apps/relay`, `apps/<game>` (multi-page host + controller), `packages/net-client`; kits deferred; relay at `relay.fostercurtis.dev`              | Relay contract is the one settled shared boundary; everything else waits for a second consumer. Separate controller entry keeps phone joins fast.                                                                                                |
| 8   | 2026-10-22 | Name + theme        | **Sunny Side Shove**: fried eggs on an overheating skillet; `sunny-side.fostercurtis.dev`, game ID `sunny-side`                                  | Fresher than sumo/bumper cars; circle-with-a-face art is cheap for a solo dev; every mechanic maps cleanly.                                                                                                                                      |
| 9   | 2026-10-22 | Disconnect behavior | Egg stops dead, input zeroed, stays hittable during reconnect window                                                                             | Foster's call: fair to others (no runaway egg), and the disconnected player is still at risk.                                                                                                                                                    |
| 10  | 2026-10-22 | Expired reconnect   | Egg stays as a hittable obstacle until knocked off                                                                                               | Knocking off stranded eggs is funny; normal KO rules apply.                                                                                                                                                                                      |
| 11  | 2026-10-22 | Relay protocol      | Hub-and-spoke, JSON, 4-letter codes, token reconnect, heartbeat, auto-admit + `lock`/`kick`                                                      | Instant joins and no pending-join state; lock/kick are room mechanics, so the relay stays game-agnostic. Rejected: host-approved joins (pending state, stalls when host is away).                                                                |
| 12  | 2026-10-22 | Late rejoin         | Host restores score by matching player key                                                                                                       | One bad Wi-Fi moment shouldn't wipe a match.                                                                                                                                                                                                     |
| 13  | 2026-10-22 | Controller input    | Two buttons (DASH/SLAM), `[x, y, buttons, dashCount, slamCount]`, press counters, floating joystick, landscape                                   | Single-button tap/hold either delays dash or adds an unwanted dash to slams. Counters make taps unmissable.                                                                                                                                      |
| 14  | 2026-10-22 | Game loop           | Fixed 60 Hz + accumulator + render interpolation; 5-step catch-up cap; inputs via latest-state records; pause on hidden host tab; host Wake Lock | Consistent physics across 60/120 Hz displays; interpolation is cheap with few moving entities. Rejected: Matter default variable step, fixed-step without interpolation (judder on 120 Hz).                                                      |
| 15  | 2026-10-22 | Player identity     | `localStorage` player key (room-scoped) for late-rejoin matching; player names in lobby, shown on leaderboard                                    | `sessionStorage` tokens die when iOS kills a tab; names make TV standings readable.                                                                                                                                                              |
| 16  | 2026-10-22 | Branding & audio    | Deferred post-MVP; single shared theme module                                                                                                    | Keeps a later rebrand to one file.                                                                                                                                                                                                               |
| 17  | 2026-10-22 | TV presentation     | HUD (scores, round, names, shrink warning), slam ring + egg anticipation + max flash, spectator emoji, lobby/results/winner screens              | TV is where players look; the slam ring doubles as an opponent tell.                                                                                                                                                                             |
| 18  | 2026-10-22 | Phone UI states     | Countdown to ghost, dampened ghost controller, spectator emoji screen, SLAM liquid fill, pause overlays (self + game)                            | Foster's design; every state has a clear, glanceable screen.                                                                                                                                                                                     |
| 19  | 2026-10-22 | Self-pause          | Any time; mid-round treated as a disconnect                                                                                                      | No pause exploit: pausing leaves you a sitting duck.                                                                                                                                                                                             |
| 20  | 2026-10-22 | Session leader      | First joiner controls Start / Next round from phone; same controls on host                                                                       | Nobody has to get up and touch the laptop.                                                                                                                                                                                                       |
| 21  | 2026-10-22 | Pause UX            | Hold-to-pause (~0.6 s); self-pause overlay = Resume + Leave; host-connection note only on game-wide pause                                        | Pause sits atop the DASH zone; a stray tap would freeze you mid-fight.                                                                                                                                                                           |
| 22  | 2026-10-22 | Emoji reactions     | 🔥 😂 😱 👏 🍳, 1 s cooldown (Foster), ~12 on screen max                                                                                         | Keeps reactions lively without flooding the TV.                                                                                                                                                                                                  |
| 23  | 2026-10-22 | Leader handoff      | Next-earliest joined connected player; no snap-back                                                                                              | Avoids confusing control flip-flops; host controls are the fallback.                                                                                                                                                                             |
| 24  | 2026-10-22 | Match end           | Leader: Rematch or Back to lobby                                                                                                                 | Covers "again!" and roster changes without touching the TV.                                                                                                                                                                                      |
| 25  | 2026-10-22 | Leave game          | Egg stays as obstacle, slot freed, name greyed; player key restores score on return                                                              | Consistent with disconnect rules.                                                                                                                                                                                                                |
| 26  | 2026-10-22 | Physics integration | Standalone `matter-js` in `src/host/sim` (no Phaser imports); Phaser renders only                                                                | Headless Vitest coverage of the sim and a parallel sim/render build. Refines #1 (was Phaser's built-in Matter).                                                                                                                          |
| 27  | 2026-10-22 | Relay host status   | Relay → phones `{ t: "host", status: "away" \| "back" }`; error codes `room-closed`, `bad-request`; `GET /healthz`                                 | Phones need to show the host-away overlay and learn when the room dies; additive to §7.1.                                                                                                                                                       |
| 28  | 2026-10-22 | Branding in v1      | Brand kit (`brand.css` tokens mirrored by `theme.ts`, brand fonts, code-drawn eggs in the mark's style); audio stays post-MVP                     | The kit arrived before the build, so the controller and TV are built on-brand instead of restyled later. Supersedes #16.                                                                                                                        |
