# PLAN: seeds, and deeper bots

Branch `seeds`, off main at `1a84fc0` (depth landed: personas, match types,
the scatter, P6 met). Decisions below were settled in conversation on
2026-11-21; anything not listed here is not yet decided.

## 1. What a seed is

- **One string is one race.** It fixes the world (land, planet, wind,
  weather), the match type, the storm's seven caps, and every bot's nature
  (persona, temperament, skill).
- **Text to number:** trim, lowercase. All digits: that number as-is (so 3
  stays 3). Anything else: its UTF-8 bytes folded through `world/random.ts`
  `hash(a, b)` into one 32-bit seed.
- **Streams from it, as now:** `createWorld(seed)`; `dealt(seed)` the match
  type; `nature(hash(seed, id), …)` each bot; `planStorm(seed, depth)`. The
  per-race `seed + STRIDE·n` dealing goes away: a seed is a single race.
- **Random seeds** are two short words from a ~256-word nautical list
  (`saltgull`, `tarbrig`). A typed seed may be any text.
- **Same on one device** is the guarantee. Not promised across devices
  (JavaScriptCore vs V8 `Math`, #62).

## 2. The seed in the game

- **Every launch rolls a random seed.** A finished race returns to the title
  as a page reload with a new random seed.
- **Result screen, two buttons:** a **seed** (a new random seed) and a
  **tree**, a palm (sail this seed again: reload with the same one).
- **The lobby shows the current seed** as a chip; tapped, it opens the seed
  panel.
- **Seed panel:**
  - opens on the current seed; typing a seed previews it live;
  - **Sail this seed** saves it and reloads;
  - **Roll** gives a random one.
- **Preview** (nothing built on the GPU, no restage):
  - **Globe:** an inked, pannable globe of that seed's coasts on parchment,
    from `landOf` / `planetOf` and the coasts traced, drawn with the full
    map's projection.
  - **Fleet card:** the match type and the most common persona; a bar per
    persona; the average and spread of skill, aggression, notice, storm
    margin and flee hull; standouts (the sharpest captain, the most
    reckless).
  - **Never shown:** the storm's caps.
- **How the seed is carried:** in the page's address, `?seed=` (`address.ts`),
  in the iOS app too (Capacitor loads `dist/index.html` in a WKWebView; a new
  address is a new page). Chosen over `localStorage`, which a private window
  may refuse. A page with no seed rolls one; a debug page with none keeps
  `SEED` (3), the planet the tools measure. A new page keeps only `?debug`, so
  a debug switch like `?leave` doesn't fire again.
- **Home from a race:** the title comes over the match and stays while the
  page loads again under it (`ui/passage.ts`). The result's tree reloads the
  same seed; its seed rolls a new one. Done in `4959a57`.
- **Restage in place:** parked. Revisit only if a reload on the iPad Air is
  slow; time it as part of step 2.

## 3. Bots: four layers

Today each bot scores her options (storm, flee, fight, hunt, loot, heal,
claim, roam) moment to moment, routes by A* with the calm field as the
fallback, and fights by range and a hand that shakes with low skill. Nothing
looks past the next few seconds; nothing is remembered past a lost sighting.

1. **Zone fix (fair: the next cap only, never later ones).**
   - **Today:** her mark is the nearest point just inside the next cap
     (`bot.ts` `inward`), so she can end up barely in, in a bay a long way
     by water from where the storm goes next.
   - **Fix:** pick the mark down the calm field (water distance to the
     cap's heart), deeper the more time is left before it closes, and price
     dead-end water: cells whose only way out is back the way in.
   - Uses only what a player sees.
2. **Strategic position per phase.**
   - **When:** as each cap is set, a bot picks a place to be when it
     closes, and keeps it (with hysteresis) rather than re-deciding every
     moment.
   - **Candidates:** points inside the cap, scored by water distance (the
     calm field), cover (land near, a way out), open water out, foes known,
     and loot.
   - **Weights are the persona's.** A turtle takes a cove with an exit, a
     hunter a strait ships must pass through, a scavenger water near loot;
     arriving early or late is the persona's too.
   - **Cost:** spread the scoring over steps, like the calm field.
3. **Memory.**
   - **What:** a short, fading record of ships seen: where, her hull, her
     gun, when.
   - **Use:** avoid a ship that beat her; come back for a wounded one; don't
     sail back into a fight she fled; position (layer 2) against known
     foes.
   - **Fair:** only what she saw or heard.
4. **Joining others' fights.**
   - **When:** hearing guns (the six-second ring already kept), a raider or
     brawler closes to just outside the guns' reach, waits while the two
     wear each other down, then falls on whoever is left (layer 3 tells her
     who is hurt).
   - **Others:** turtles and homesteaders steer clear of the sound.

Each layer gates on the report (section 5) over the planet pool: damage per
minute, longest lull and persona distinctness must not regress; the step
budget holds (worst step under 16 ms, iPad Air M1 at 30-40 fps).

## 4. Loot

- **Much more plentiful on average**, for high-damage, high-healing fights.
- **How:** scale `DEFAULT_RULES` loot (spots, pieces, mending, caches). Each
  match type keeps its character relative to it: a gold rush is still the
  richest, a cagey match the sparest.

## 5. Measuring: generalise, don't overfit

- **The overfit so far was the planet.** Every rating ran on planet 3
  (`rate.ts` passes none; `tools/harness/world.ts` defaults to `SEED`), and
  the cove fixes were found on its coasts.
- **Planet pool:** 5 random planets to tune on, 5 held out (fixed lists in
  the harness). Planet 3 has no special place.
- **Root causes, not numbers.** A change is a fix for a behaviour seen in a
  replay and explained, then measured; tuning for its own sake isn't the
  work. With causes found, a small pool is enough.
- **Metrics, per planet and pooled:**
  - damage dealt per minute, per ship afloat;
  - hull mended per minute, per ship afloat;
  - sustain: mended ÷ dealt;
  - longest lull (the longest stretch with no hits);
  - persona distinctness (how far apart the personas' time-in-mode and
    shots per ship are);
  - stuck and aground seconds;
  - the persona rating spread (P6).
- **Targets:** set from a baseline measured on the pool. Damage and healing
  per minute up, sustain held. **Gates:** damage per minute, longest lull and
  persona distinctness on the held-out five, and the worst planet as well as
  the mean.

## 6. Order of work

1. ~~Land depth on main.~~ Done (`1a84fc0`). Landing it checked out a
   committed `node_modules` symlink (`718ee0e`) over the main checkout's real
   one; restored with `npm ci`, and untracked on `seeds` (`d3dec6f`). Main
   still tracks it until `seeds` lands.
2. ~~**Seed module and plumbing.**~~ Done (`4959a57`): text to seed, the word
   list, `?seed=`, a random seed per launch, the reload to the title, the seed
   and tree buttons. Still to do: time a reload on the iPad. The lobby chip
   moved to step 3.
3. **The lobby chip and the seed panel:** the inked globe and the fleet card.
   Tested in headless Chromium.
4. **Harness pool and report page:** the 5 + 5 planets; an HTML report of
   section 5's metrics per planet, each planet linking its replay
   (`tools/harness/replay.ts`).
5. Then, each gated on the report: loot scaled up, then bot layers 1 to 4.

Steps 3 and 4 can run in parallel worktrees once step 2 lands.

## Tuning passes

A pass is one change, run on the 5 tuning planets, then checked on the 5
held out. At most 3 passes per layer, and for the loot change. Stop early
when a pass doesn't beat the noise (1 se) on the held-out planets, and keep
the best so far.

## Not decided / later

- Restage in place (parked).
- Automated parameter search: only after layers 1 to 4, on the pool.
- The manager game: about as far from main as before; its pure career code
  ports moderately, its office UI heavily; restage would serve it.
