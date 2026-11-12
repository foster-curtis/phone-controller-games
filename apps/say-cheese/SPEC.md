# Say Cheese! — SPEC

> Living spec. Only **decided** items go in the body. Open questions live in §9 until we settle them.
> Repo-wide rules (architecture, phone requirements, hosting, layout): [`PLATFORM.md`](../../PLATFORM.md). Relay protocol: [`apps/relay/SPEC.md`](../relay/SPEC.md).
> Working title was "Dodge the Photographer". Concept notes: project doc `claude/dodge-the-photographer.md`.
> Last updated: 2026-11-03 (rev 3, SC0: brand kit, synth audio, `messages.ts` finalized)

## 1. Overview

Same-room party game, based on a real-life game. Each round, one player is the **photographer**: eyes closed (or blindfolded), they spin around the room snapping photos with an in-app camera on their phone while everyone else scrambles to stay out of the shot. Then the room reviews the photos together on the TV, and the photographer tags everyone who got caught. Being caught costs you a point; each catch earns the photographer one. Everyone takes one turn behind the camera, and the **lowest score wins**.

The software is a referee and a slideshow: the fun happens in the room (ducking, diving behind each other when the camera swings your way, arguing over whose elbow that is). That's why it's small: no physics, no real-time simulation, no netcode tuning.

Third game in the series (`PLATFORM.md` §1). Target: playable at Foster's event about 2 weeks from 2026-11-02.

## 2. Architecture (settled)

`PLATFORM.md` §2. One game-specific note: phones still send no movement input. Every phone→host message is a discrete event (lobby actions, a shutter press, a tag), which is fine because this game is turn-based, not simulated (see §8).

## 3. Phone controller requirements (settled)

`PLATFORM.md` §3, plus:

- **Camera:** `getUserMedia` (needs HTTPS, so LAN dev needs a trusted cert or a tunnel). Rear camera (`facingMode: "environment"`).
- **Orientation:** portrait (not landscape like Sunny Side). The camera captures in whatever way the phone is held.
- **Audio on the phone is in v1** (the photographer can't see): a shutter click per shot. Web Audio is unlocked by the photographer's Ready tap. Where supported, set `navigator.audioSession.type = "playback"` so the iOS silent switch doesn't mute it. The TV also plays every sound (§6.8), so the phone sound is a nice-to-have, not load-bearing.
- **Sleeping phones are normal here.** Dodgers are told to pocket their phones during the round. Their sockets drop via the heartbeat and reconnect on wake (`net-client` retries on `visibilitychange`). The host must not treat that as leaving (§6.3).

## 4. Hosting & repo (settled)

Repo-wide hosting and layout: `PLATFORM.md` §4. Say Cheese specifics:

- **Game domain:** `say-cheese.fostercurtis.dev` (Vercel). Game ID (relay namespace): `say-cheese`.
- **App layout:** `apps/say-cheese/`: `index.html` host (TV), `play.html` controller (phone), `src/host/`, `src/controller/`, `src/shared/`.
- **Shared kits:** uses `@pcg/net-client`. Uses `@pcg/controller-kit` / `@pcg/game-kit` if Fort Frenzy has extracted them by build time; otherwise the implementer copies the few pieces it needs from Sunny Side (app shell, Wake Lock, fullscreen on tap, storage) into extraction-ready folders. The implementer decides based on the state of the `fort-frenzy` branch.
- **Photo transfer** (§7.4) lives in `src/shared/blob-transfer/` with no game imports, ready to move into `net-client` when a second game (gallery caption game, photo scavenger hunt) needs it.

## 5. Engine

- **No game engine.** The TV and the phones are plain TypeScript + DOM + CSS (the bundler is Vite, as for every game). Photos are `<img>` elements; tag circles are absolutely positioned elements over them, placed with normalized (0–1) coordinates.
- **Boundary rule** (same as Sunny Side): match state (roster, turn order, phase, photos, tags, scores) lives in plain TS modules in `src/host/match/` with no DOM imports, so it's unit-testable headlessly. The view only renders the state.

## 6. Game design (v1)

### 6.0 Theme

Camera / photo booth: the shutter, the flash, a "Say cheese!" moment. Brand kit: direction A2 "Flash pop" (`src/styles/brand.css`, `brand/`, `public/`; read-only, decision #16).

### 6.1 Scope

- **Players:** 3–8. (2 players means one dodger, which isn't a game; above 8 the room gets too crowded to scramble around in.) No bots. The cap counts **players, not phones**: players can share a phone (§6.3.1), down to one phone for all 8. The title and this range live in `game.meta.ts` (the game's catalog entry, `PLATFORM.md` decision #9): code reads them from there (`MIN_PLAYERS`, `MAX_SEATS`, and `MAX_PHONES` = seats + 2), so change them there.
- **Words:** the players who aren't the photographer are **dodgers**, and the countdown phase is **scatter**. Player-facing text never says "hide": the fun is scrambling when the camera turns your way, not camping behind the couch (§6.2.1).
- **Match:** every player is photographer **exactly once**, in a random order shuffled at match start. Turn order isn't shown in advance; the TV reveals each photographer at the start of their round.
- **Round:** scatter countdown **5 s** → shoot for **20 s or 15 shots, whichever comes first** → review → round results.
- **Scoring** (per photo): each player tagged in a photo gets **+1**; the photographer gets **−1** per tag. A player tagged in 4 photos gets +4. A player can be tagged at most once per photo. The photographer can't be tagged. Lowest total wins; **ties share the win**.
- **No power-ups, variants, or multiple laps** in v1.
- **Photos are never stored:** they live in the host tab's memory and are discarded at match end (or when the tab closes). The relay only forwards them. Nothing is uploaded to any server or written to disk.

### 6.2 Round flow

Phases: `announce → scatter → shoot → upload → review → results`, preceded once per room by the rules overview (§6.2.1). Each is a state in the match state machine (§8).

0. **Pass the phone** (only if the photographer shares a phone, §6.3.1). The TV and that phone show "Pass the phone to {name}"; the phone has a big **I'm {name}** button that leads to Announce.
1. **Announce.** The TV shows "📸 {name} is the photographer!" The photographer's phone shows a camera preview so they can check it works, and a big **I'm ready** button. Everyone else's phone says "Get ready to dodge!" Tapping **I'm ready** unlocks audio on the phone and starts the scatter phase.
2. **Scatter (5 s).** The photographer closes their eyes or puts on a blindfold. Their phone goes dark with "Eyes closed! Starting in…". The TV shows "Scatter!" and counts down out loud: a beep on every second (5, 4, 3, 2) and a final beep at 1, played on the TV and on the photographer's phone so they hear the count with eyes closed (decision #20). Dodgers' phones show "Scatter! Pocket your phone and keep moving." Staying in the open is a house rule from the rules overview (§6.2.1), not enforced.
3. **Shoot (20 s or 15 shots).** A start buzz plays on the TV. The photographer's **whole screen is the shutter**: any tap takes a shot (0.4 s cooldown so one tap isn't two shots). Each shot plays a click on the phone, and a click plus a white flash and the shot count ("📸 7 / 15") on the TV. The TV shows only the timer and the count, never the photos (that would tell dodgers where the camera is pointing). An end buzz plays when time runs out or shot 15 is taken.
4. **Upload.** Photos upload while the photographer is shooting (§7.4), so this is usually instant. The TV shows "Developing photos… 13 / 15" until all photos have arrived or **10 s** have passed, then moves on with whatever arrived. If 0 photos arrived, the round scores nothing and goes to results.
5. **Review** (§6.4). Untimed; the photographer goes at the room's pace.
6. **Results.** The TV shows this round (who was caught how many times, the photographer's total) and the running standings, sorted lowest first. The leader taps **Next photographer** (§6.5). After the last photographer, it shows the **match end** screen instead.

### 6.2.1 Rules overview

- **When:** after the leader taps **Start** on the room's first match, before the first photographer is announced. **Rematch** skips it (same group). The leader can reopen it from the lobby with **How to play**.
- **Controls:** a series of cards on the TV. The leader's phone (and the host's keyboard/controls) has **Next** and **Skip**; the last card's button reads **Let's play!**. Nobody else can advance it.
- **Tone:** short, punchy, one idea per card, readable from across the room. It frames the game as **dodging, not hiding**: the house rules are the most important card.
- **Cards** (draft copy; final wording at implementation):
  1. **Say cheese!** One player is the photographer. Eyes closed, they spin around and snap photos for 20 seconds. Everyone else: stay out of the shot!
  2. **Keep moving.** The photographer can turn any way, any time. When the camera swings toward you, duck, dive, or slip behind another player. Other people make the best cover!
  3. **House rules.** Stay in the room and out in the open: no hiding behind couches, doors, or furniture. Camping in one spot ruins the fun; the scramble *is* the game. Photographer: no peeking! And watch out for each other.
  4. **Busted!** After each round, everyone watches the photos on the TV. The photographer taps everyone they can spot (yes, an elbow counts). Each photo you're in: **+1**. Each catch: **−1** for the photographer.
  5. **Lowest score wins.** Everyone gets one turn behind the camera. Fewest points at the end wins.

### 6.3 Match flow

_In this section and the rest of the spec, "player" means a person (a seat), and "phone" or "device" means a connected controller. Usually they're the same; §6.3.1 covers when they aren't._

- **Joining, then lobby:** players join with the room code or QR. First comes a **"who's playing on this phone"** screen (§6.3.1, §6.7): your **name** (~10 chars, prefilled from last time via `localStorage`) plus any other players on this phone, and a big **Join**. Only after Join does the phone show the **lobby** and its players appear in the room on the TV. Each player gets an auto-assigned **color** (used for their tag circles). In the lobby they tap **Enable camera**, which triggers the permission prompt now, while everyone can still see. Then they tap **Ready**. The leader taps **Start** once ≥3 players are connected and every connected player is Ready.
  - **Camera denied or unavailable:** the player can still play and be caught, but they're **skipped as photographer**. Their phone and the TV lobby show a "no camera" badge with a hint to allow camera access in the browser settings and tap Enable camera again.
- **Mid-match joiners** spectate (emoji only, §6.6) and can't be tagged. They join in the next match.
- **Disconnects:**
  - A disconnected dodger stays in the match: they can still be tagged, and keep their turn and score. (Usually they just locked their phone.)
  - **Photographer disconnects in announce/scatter:** the round is cancelled with no score, and they go back into the queue (moved to the end). If they don't come back by then, they're skipped.
  - **Photographer disconnects during shoot or review:** whatever photos have arrived are kept. Review continues when they reconnect. Meanwhile, the leader's phone (and the host) get **Skip review**: score the tags made so far and move to results.
  - **Their turn comes up but they're disconnected:** the next connected player in the queue goes first, and they move to the end. If they're still gone when the queue runs out, they're skipped.
- **Late rejoin** (after the relay's reconnect window): matched by **player key**, which restores name, color, score and turn, as in Sunny Side.
- **Leave game** = full removal (same as Sunny Side's C3 rule): gone from the roster, standings and turn queue. Tags already scored on them stay in the photographer's score. A later join with the same key is a new player who spectates.
- **Host refresh mid-match:** roster, scores, turn queue and the current round number are restored from `sessionStorage`. Photos aren't (memory only), so a round that was in progress is **replayed** with the same photographer.

### 6.3.1 Shared devices

So kids (or anyone without a smartphone) can play, several players can share one phone, all the way down to the whole game on a single phone.

- **Model:** the relay sees one connection per phone, as always (no relay or protocol change). The host splits each connection into **seats**: each seat is a full player with its own name, color, score, turn as photographer and player key. Only the host and the controller know about seats.
- **Adding players (before the lobby):** the screen a phone sees right after opening the join link shows your name field and **+ Add another player** rows (a name each, ✕ to remove), up to the room's 8-player cap. Nothing is sent to the host, and nobody appears on the TV, until the big **Join** button: it seats the phone's own player first, then the extra ones, and then the phone shows the lobby.
  - A collapsible **Why share a phone?** hint on that screen: *"No phone? No problem. Add kids or anyone without a phone here. You'll just pass this phone to them when it's their turn to take photos."*
  - **Editing in the lobby:** the lobby shows this phone's name(s) once at the top with a ✏️ pencil. The pencil goes back to the same screen, prefilled with the phone's current players; **Join** again applies only the changes (renames, new players, removed players). While editing, the phone's players stay in the room on the TV. The pencil only exists in the lobby; once a match is running there is nothing to edit (players are removed with the Leave menu, below).
  - On the TV lobby, shared seats are grouped under their phone's first player (a small 📱 marker) so it's obvious who's sharing.
- **Ready and camera are per phone:** one **Ready** tap covers every seat on the phone; the camera permission belongs to the phone, so "no camera" skips every seat on it as photographer.
- **Pass screens:** a phone only needs one person holding it when that person has something to do on it, which in this game is **only the photographer**. When a seat on a shared phone becomes the photographer, step 0 of the round (§6.2) shows "Pass the phone to {name}" on the TV and the phone before the camera preview appears. During the rest of the round, a shared phone shows the dodger screens with every one of its seats listed ("Ana, Leo, Mia: scatter!"). Single-seat phones never see a pass screen.
  - **Watch out for:** after a review, the phone stays with the photographer who just finished; results and the next pass screen take it from there. No "pass it back" step.
- **Leader:** leadership belongs to a phone (its first seat's name is shown as the leader). In a one-phone game, that phone has every control. The host's own controls work as always.
- **Disconnects:** a phone's seats share its connection, so the disconnect rules (§6.3) apply to all of them together. Late rejoin restores every seat: the phone keeps one player key per seat in `localStorage` (scoped as usual), and the host matches them all.
- **Leaving:** the ✕ on a player row (pre-lobby screen, reached by the lobby's pencil) or **Remove a player** on that phone (any time, a list of its seats) removes one seat with the usual Leave rules. **Leave game** on the phone removes all of its seats. The leader/host removal works per seat.
- **Order:** shared seats go into the random turn queue like everyone else; seats on the same phone aren't kept together or apart.
- **Platform note:** this "seats on a device + pass screen" pattern is game-agnostic and will matter more for games with private info on the phone. It's built in `src/shared/` + `src/controller/` extraction-ready, as a candidate for `controller-kit` once a second game uses it. Extracting it is a separate decision.

### 6.4 Review & tagging

- **Only the photographer tags.** Their phone is the only one with tagging controls; the host ignores `tag`/`untag`/`view`/`finishReview` from anyone else. **Everyone watches it happen on the TV:** each circle appears there the moment it's placed (without a name; the player column's count updates, §6.6).
- The TV shows the current photo large, with "Photo 4 / 15" and the photographer's name. The photographer's phone shows **the same photo** (it already has a local copy, so nothing is sent back) with **‹ Prev** / **Next ›** buttons. The TV follows the phone's navigation.
- **Tagging:** the photographer taps anywhere on the photo. A circle appears where they tapped, and a bottom sheet lists every other player (name + color) plus **Unknown**. Tapping a name sets the circle to that player's color with a name label. The tag shows on the TV **immediately**, so the room sees (and argues about) every call.
  - No image analysis: the circle just marks where the photographer tapped.
  - A player already tagged in this photo shows greyed out with a ✓ in the sheet (one tag per player per photo).
  - **Unknown** draws a grey "?" circle and scores nothing. It's there so the room can mark "someone's there, can't tell who."
  - Tapping an existing circle opens the sheet with **Remove** and the names (choosing a different name changes the tag).
  - Tapping outside the sheet before picking a name discards the new circle.
- **Disputes** are table talk: there's no voting. The photographer has the final say on their own phone.
- **Finish:** on the last photo, **Next ›** becomes **Finish review** (with an "Are you sure?" step). Scoring happens on Finish, from the final tags.
- Circle size is fixed (~12% of the photo's short side): a marker, not a hitbox.

### 6.5 Session leader

Same as Sunny Side §6.5: the first joiner is the leader, with **Start** and **How to play** (lobby), **Next** / **Skip** (rules overview), **Next photographer** (results), **Skip review** (photographer gone, §6.3), and **Rematch** / **Back to lobby** (match end). The same controls are always on the host (TV/laptop), drivable by keyboard or a phone, with no hover (`PLATFORM.md` launch habits). Handoff goes to the next-earliest joined connected player, with no snap-back. The leader (and the host) can remove a player, same as Sunny Side C3.

The photographer, not the leader, drives their own **I'm ready** and the review.

### 6.6 TV presentation

- **Lobby:** QR + room code, joined players (name, color, ready, no-camera badge).
- **Rules overview:** one card per screen (§6.2.1), big text plus a simple inline-SVG illustration, with a progress dots row and the controls hint ("Leader: Next / Skip").
- **Announce / scatter:** the photographer's name huge, countdown huge, "Scatter!".
- **Shoot:** timer + shot count; a white flash + click per shot (the flash decays in 260 ms and the counter pops; neither runs under `prefers-reduced-motion`).
- **Upload:** "Developing photos… n / N" over a print whose window is still dark and fills as photos arrive.
- **Review (decision #22):** the photo is an **instant print** (cream frame with the fat bottom strip, a slight tilt, the pink offset shadow) sized as large as fits beside a **player column**. Tags on the photo are **only the circle** in the tagged player's color (Unknown: a grey circle with "?"); they carry no name label, and a new one pops in. The column lists every player still in the match except the photographer (color chip, name in their color, **tags this round**, live; the row of anyone tagged in the current photo is highlighted). A new photo "develops" (fades up from a dark warm smear).
- **Results / match end:** this round's catches pop in one by one, then standings (lowest first). The match end is a podium ("Hardest to photograph"): one step per distinct rank (top 3), first place in the middle and tallest, **tied winners side by side** on it, with a crown on every winner.
- **Feedback (#24):** the match end has a QR to the feedback form pre-filled for this game, in a column reserved on the right, bottom-aligned (PLATFORM decision #11); every phone's match end has **Give feedback**, which opens it in a new tab.
- **Emoji reactions** from every non-photographer phone during review and results (the same system as Sunny Side's spectator emoji: 5-emoji set 📸 😂 😱 🙈 👀, 0.5 s cooldown, ~12 on screen). Cut first if time runs short.

### 6.7 Phone UI states

- **Joining** (name + Add another player rows + Why share a phone? + **Join**; nothing is sent until Join) → **Lobby** (this phone's name(s) once at the top with a ✏️ pencil back to Joining, Enable camera, Ready; leader sees Start and How to play).
- **Pass the phone** (shared phones only, §6.3.1): "Pass the phone to {name}" + a big **I'm {name}** button.
- **Rules overview:** leader sees **Next** / **Skip** (Next becomes **Let's play!** on the last card); everyone else sees "Watch the TV".
- **Photographer:** announce (preview + I'm ready) → scatter ("Eyes closed!", dark) → shoot (dark full-screen shutter with a big faint shot counter) → review (photo, tag sheet, Prev/Next/Finish).
- **Dodger:** announce ("Get ready to dodge!") → scatter/shoot ("Scatter! Pocket your phone and keep moving.") → review ("Photo 4 / 15. Watch the TV!" + emoji bar).
- **Results / match end:** your round score + standings; the leader sees their buttons.
- **Spectating, reconnecting, host away:** same as Sunny Side.
- **Pause:** none. Turn phases are short, and a missing photographer is handled by the disconnect rules (§6.3).

### 6.8 Branding & audio

- One theme module (CSS custom properties), as in Sunny Side: the brand kit's `src/styles/brand.css` (decision #16).
- **Audio is in v1** because the photographer is blind and the dodgers aren't watching a screen: countdown beeps, start/end buzz, a shutter click (TV and phone), a "photo developed" sound per review photo, and a round-results sting. Commercially licensed or self-made sounds only (`PLATFORM.md` launch habits): all synthesized with Web Audio, no sound files (decision #17).

## 7. Protocols

### 7.1 Relay protocol

Relay SPEC §3, unchanged. Say Cheese uses:

- Game ID `say-cheese`; rooms created with `maxPlayers` 10 (8 players + 2 spectators). `maxPlayers` counts phones; the host enforces the 8-**player** (seat) cap itself (§6.3.1).
- The room never locks (mid-match joiners spectate).
- `peer` events feed the disconnect rules (§6.3); late rejoins are matched by player key.
- **No relay change.** Photos go through the existing 16 KB limit as chunks (§7.4).

### 7.2 Controller input

No continuous input. Every phone→host message is a discrete JSON event (§7.3). The only time-sensitive message is the shutter, and shots are captured on the phone itself, so relay latency never affects what gets photographed.

### 7.3 Game messages

Phone → host:

```ts
{ t: "hello", seats: [{ seat, seatKey, name }] } // every (re)connect: restores extra seats; seat 0's key = relay playerKey
{ t: "profile", seat, name }                // lobby; seat = phone-local index, 0 = the phone's first player
{ t: "addSeat", name, seatKey }             // lobby: add a player on this phone (§6.3.1)
{ t: "removeSeat", seat }                   // remove one player on this phone
{ t: "seatConfirm", seat }                  // "I'm {name}" on the pass screen
{ t: "camera", ok: boolean }                // lobby, after the permission attempt
{ t: "ready", ready: boolean }              // lobby
{ t: "leader", action: "start" | "howToPlay" | "next" | "skip" | "skipReview" | "rematch" | "lobby" }
{ t: "leader", action: "remove", playerId }
{ t: "shootReady" }                         // photographer: I'm ready
{ t: "shot", r, photo, at, aspect }         // photographer: shutter pressed (drives TV flash/count); photo = index 0..14; aspect = w/h
{ t: "chunk", r, photo, i, n, b64 }         // §7.4
{ t: "shootDone", r, count }                // photographer: final shot count
{ t: "view", photo }                        // review navigation
{ t: "tag", photo, tagId, x, y, playerId }  // add or change; x, y ∈ 0..1; playerId null = Unknown
{ t: "untag", photo, tagId }
{ t: "finishReview" }
{ t: "emoji", i }
{ t: "leave" }
```

Host → phone: `{ t: "screen", screen, ...data }` per phone or broadcast (the host drives each phone's state, as in Sunny Side), plus `{ t: "photoAck", r, photo }` (§7.4). Every screen carries `leaderName`, `isLeader`, `canEmoji` and the phone's `seats` (`{ seat, name, color }[]`); timed screens carry `endsInMs` (§8); review screens carry each photo's `aspect`. `r` is the round id: every photo message carries it, so a replayed or cancelled round never mixes photos (decision #18). Host-side, a player's id is the relay `playerId` plus the seat (e.g. `p3#1`); messages that only the photographer can send (shot, tag, review) don't need a seat because the host knows which seat is shooting. The host is authoritative for tags too: it validates them (photo exists, player is in the match, one tag per player per photo) and echoes the photo's tag list in the review screen, so a reconnecting photographer's phone redraws correctly.

_Exact fields: `src/shared/messages.ts` (frozen at SC0, additive changes only)._

### 7.4 Photo transfer (chunking)

- **Capture** (phone): draw the current `<video>` frame to a canvas (instant, no shutter lag; `ImageCapture.takePhoto` isn't available in Safari), scaled so the **long edge is 800 px**, then `canvas.toBlob("image/jpeg", 0.7)`. Expected **~50–100 KB** per photo. Starting values; tune in testing for "can you tell whose elbow that is on the TV."
- **Send:** base64 the JPEG and send it as `chunk` messages of at most **12,000 base64 chars**, which keeps every envelope safely under the relay's 16 KB `maxPayload`. Photos send in shot order as they're taken. WebSockets are ordered, but `i`/`n` are included so reassembly doesn't depend on that.
- **Receive** (host): collect chunks per `(photographer, photo)`. When all `n` have arrived, decode to a `Blob` + object URL and reply `photoAck`. Revoke the object URLs at match end.
- **Retry:** the phone keeps every photo in memory until it's acked. After a reconnect, it resends unacked photos from chunk 0 (the host discards partial ones on `peer left`).
- **Budget:** 15 photos × ~100 KB ≈ 1.5 MB per round through the relay, a few seconds on venue Wi-Fi, mostly hidden behind the shoot itself.
- **Why not raise the relay limit or use binary frames:** the 16 KB cap protects the shared relay and every game on it, and chunking also gives the upload progress bar for free. Binary frames would only save the ~33% base64 overhead; `codec.ts` already isolates encoding, so that stays a contained change for later. Moving this module into `net-client` (as `sendBlob` / `onBlob`) is planned for the second photo game (§4).

## 8. Game flow (no game loop)

- No fixed-step simulation and no render loop. The host is an **event-driven state machine**: `lobby → rules → (announce → scatter → shoot → upload → review → results)×N → matchEnd`. Each transition comes from a phone message, a leader action, or a host timer.
- **Timers** (scatter 5 s, shoot 20 s, upload grace 10 s) run on the host with `performance.now()`-based deadlines. Phones display the countdown from `endsInMs` on each timed screen: the phone sets its local deadline on receipt, so the error is the one-way relay latency, well under the ±100 ms needed (no clock-offset handshake; decision #19). The phone enforces the 15-shot cap and its own end-of-shoot locally, so it never takes a shot the host would reject.
- **Host visibility:** if the host tab is hidden, the TV-side timers pause (scatter/shoot/upload). Request Wake Lock on the host and every phone.
- Unit tests cover the state machine: phase transitions, scoring, tag validation, turn queue with disconnects/skips, chunk reassembly.

## 9. Open questions (in order)

1. ~~**Brand look:** palette, logo/wordmark, fonts.~~ Settled: brand kit A2 "Flash pop" (decision #16).
2. ~~**Sound sourcing:** pick a licensed SFX pack or make the sounds (§6.8).~~ Settled: synthesized with Web Audio (decision #17).

## 10. Decision log

| # | Date | Decision | Choice | Why |
| --- | --- | --- | --- | --- |
| 1 | 2026-11-02 | Next game | Say Cheese! (was "Dodge the Photographer") as the third game, targeted for Foster's event ~2 weeks out | Turn-based with no physics or netcode, the design was already worked out, and it's proven in real life. Rejected for the deadline: rhythm game (relay jitter vs timing), fencing/racing/obstacle/Dungeon Crew (real-time sim + tuning), scavenger hunt and social deduction (designs not ready). |
| 2 | 2026-11-02 | Name | **Say Cheese!**: `say-cheese.fostercurtis.dev`, game ID `say-cheese` | Foster's pick. |
| 3 | 2026-11-02 | Photo transfer | Chunk JPEGs (≤12,000 base64 chars per message) through the unchanged relay; extraction-ready module, moves to `net-client` with the second photo game | Long-term fit for the backlog: the caption game and scavenger hunt need the same thing, and no relay redeploy or shared-limit change. Rejected: raising `maxPayloadBytes` (weakens a protection every game relies on), an HTTP upload endpoint (a new relay feature, overkill for ~100 KB), binary frames (only saves 33%; deferred, contained in `codec.ts`). |
| 4 | 2026-11-02 | Tagging | Tap anywhere → circle at the tap point → name sheet (+ Unknown); live on the TV; one tag per player per photo; photographer has the final say | Foster's design. Costs little more than a names-only list, and the circles on the TV are the payoff. |
| 5 | 2026-11-02 | Round length | 10 s scatter; shoot ends at 20 s or 15 shots; 0.4 s shutter cooldown | Keeps each review to ~1–2 min and an 8-player match to ~20 min. |
| 6 | 2026-11-02 | Scoring | +1 per tagged appearance per photo; −1 to the photographer per tag; lowest wins; ties share | The real-life rules. |
| 7 | 2026-11-02 | Engine | Plain TS + DOM, no Phaser | Nothing moves except UI; an engine adds bundle size and nothing else. |
| 8 | 2026-11-02 | Camera permission | Requested in the lobby; a denied camera = playable but skipped as photographer | A blindfolded player can't answer a permission prompt mid-turn. |
| 9 | 2026-11-02 | Privacy | Photos live in host memory only, discarded at match end; never stored server-side | Photos of people in a room; nothing needs to persist. |
| 10 | 2026-11-02 | Audio | In v1 (beeps, buzz, shutter, review/results sounds) | The photographer can't see and the dodgers aren't watching a screen; sound carries the round. |
| 11 | 2026-11-02 | Player cap | 3–8 players (was 3–10); `maxPlayers` 10 incl. spectators | Foster: 10 is too crowded to scramble around a room. |
| 12 | 2026-11-02 | Rules overview | 5 TV cards before the room's first match; leader taps Next / Skip; skipped on Rematch; reopenable from the lobby | Teaches the game without anyone reading rules aloud, and sets the house rules (stay in the open, no furniture hiding) that keep the scramble fun. |
| 13 | 2026-11-02 | Wording | Never say "hide": non-photographers are **dodgers**, the countdown is **scatter** | Foster: "hide" invites camping behind a couch all round; the fun is scrambling when the camera turns your way. |
| 14 | 2026-11-02 | Who tags | Photographer only (host rejects tag messages from other phones); every tag shows live on the TV | Clarifies #4: one person decides, the whole room watches and argues. |
| 15 | 2026-11-02 | Shared devices | Seats per phone, host-side only (no relay change); Add another player on this phone + Why share a phone? hint in the lobby; Ready and camera per phone; a Pass the phone screen only before a shared seat's photographer turn; 8-player cap counts seats | Foster: lets kids and people without smartphones play, down to one phone for the whole game. Only the photographer uses a phone during a round, so one pass screen per turn covers it. |
| 16 | 2026-11-03 | Brand kit | Unpack `say-cheese-brand-kit.zip` (direction A2 "Flash pop": `src/styles/brand.css`, `brand/`, `public/`), read-only like Sunny Side's; zip deleted. Settles §9.1 | User approved (BUILD_PLAN §8). |
| 17 | 2026-11-03 | Sounds | Synthesized with Web Audio on the TV and the phone, no sound files. Settles §9.2 | User approved; no licensing, nothing to download. |
| 18 | 2026-11-03 | Message additions (§7.3) | `hello` with the phone's seats on every (re)connect; leader `skip` (rules) and `howToPlay` (lobby); round id `r` on `shot`, `chunk`, `shootDone`, `photoAck`; `shot` carries the frame's `aspect` and review screens carry each photo's `aspect` | Restores extra seats after a reconnect; stale photos from a cancelled/replayed round are dropped; the phone and TV lay out a photo before it has decoded. |
| 19 | 2026-11-03 | Timers on phones | Screens carry `endsInMs`; the phone sets its deadline on receipt | Simplest equivalent of a clock-offset handshake; error = one-way relay latency. |
| 20 | 2026-11-10 | Scatter length and beeps (C2) | Scatter **5 s** (was 10 s, #5); a beep every second (5…2) and a final beep at 1, on the TV and on the photographer's phone (was: TV only, last 3 s) | User's C2 note: 10 s was too long, and the photographer, eyes closed, should hear every count. |
| 21 | 2026-11-09 | Joining flow (real-device checkpoint) | A separate pre-lobby screen for your name and the other players on the phone, with a Join button; only Join seats anyone and shows them on the TV. The lobby shows the phone's name(s) once with a ✏️ pencil back to that screen; re-Join sends only the diffs. Replaces the lobby's name field and "Players on this phone" panel (amends #15) | Foster, on real phones: setting up who is playing belongs before the lobby, and the lobby shouldn't repeat names or hold forms. No message changes: `profile`, `addSeat`, `removeSeat` as before. |
| 22 | 2026-11-10 | TV review layout (C3) | The review photo is an instant print as large as fits beside a column of every player's name (in their color), color chip and tag count this round; tag circles carry no name label (amends §6.4/§6.6's "name labels"; the old "Caught this round" strip is replaced by the column) | User's C3 note: photos too small, names on the photo cluttered it. Per-round counts rather than per-photo, because they match the score the round is about to produce; who is in the current photo is shown by a highlighted row. |
| 23 | 2026-11-10 | Catalog entry | `game.meta.ts` holds the title, player range (3–8), catalog descriptions and card and link-share art (`catalog/card.jpg`, `catalog/share.webp`); `MIN_PLAYERS`, `MAX_SEATS`, `MAX_PHONES` (= seats + 2), the TV Start label and the rotate note read it | One source for the gallery and the game (`PLATFORM.md` #9). Values unchanged; `messages.ts` keeps its names (frozen). |
| 24 | 2026-11-11 | Feedback link | Match end only: a QR (`host/view/feedback.ts`, error level L) in a right column the view reserves with its padding, bottom-aligned: `min(340px, 31vh)` from 1600×900 up (~7.5 px modules at 1080p), else `min(200px, 22vh)` with the board's minimum widths trimmed (podium blocks 140 px, standings 300 px) so it still fits 1280×720; **Give feedback** on every phone's match end, a new-tab link | PLATFORM decision #11. The final screen, so it never interrupts a match; the host controls are unchanged. |
