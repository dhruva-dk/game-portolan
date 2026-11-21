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

## Results

Each step against the baseline before it (`tools/harness/report.ts`, 16
matches a planet on all ten; ± one se; held = the five held out). Step budget
from `npm run steps` (median / p95 / worst, ms a step).

**Step 1, loot (much more plentiful).** Spots 320 → 640, guns 0.42 → 0.36 of
pieces, mending counts up (small shield 3 → 4, repair kit 4 → 5), its shares
leaning to the hull (0.36 / 0.22 / 0.28 / 0.14 → 0.26 / 0.32 / 0.20 / 0.22),
caches 5 → 8; the match types' loot written as so many times the game's own,
so each keeps its character. Held pooled: damage 122.9 → 129.1 (+6.2 ± 1.8);
hull mended 7.79 → 10.82 (+3.0 ± 0.3); shield restored 67.0 → 68.8 (+1.8 ±
0.7); sustain 0.608 → 0.617; longest lull 88.8 → 83.7 (−5.1 ± 6.2);
distinctness 0.171 → 0.172; stuck 4.07 → 3.93; aground 0.20 → 0.09; spread
0.140 → 0.067. Worst held: damage 119.5 → 125.7, lull 97.8 → 91.6.
Flag: the tune set's lull rose 74.5 → 87.2 (+12.7 ± 5.5) in all four runs
made; held moved the other way. Steps 1.68 / 4.42 / 11.4 → 1.96 / 4.71 /
13.2: a sweep over twice the pieces, and routes found again in lockstep (a
group of ships every 2 s, 14 ms): each route's next look is now staggered by
her cell, as its first was.
- Tried: ×1.5 spots with the old shares (held damage +5.7 ± 1.9, hull +2.0 ±
  0.3); ×2 spots (damage +8.9 ± 1.9, hull +2.0 ± 0.3: hull mending flat, the
  slots full of shields); kept ×2 with the shares leaning to the hull (hull
  +2.7 ± 0.3, damage +6.2, within noise of ×2).

**Step 2, layer 1 (the zone by water).** Seen: a bot reckoned herself inside
the next cap as the crow flies, and stopped half her margin in, though in a
bay far round by sea from where the storm was going; her mark was the nearest
water just inside. Now, with the chart's way into the next cap's heart (Sea
calm, which now carries the heart's size), how far in she is is that way's
cost short of the heart, and her mark is down the way to where it costs her
margin in, deeper by up to half of the rest the more time is left (40 s);
bounded at 40 cells a think (storming.ts; route.ts fieldAt, downTo). Ships
outside the cap as it finished closing, six matches on 2807500422: 46 of 232
→ 26 of 220. Held pooled: damage 129.1 → 130.9 (+1.9 ± 1.8); hull mended
10.82 → 10.63 (−0.2 ± 0.4); sustain 0.617 → 0.609; lull 83.7 → 92.2 (+8.5 ±
5.8); distinctness 0.172 → 0.162 (−0.011 ± 0.007); stuck 3.93 → 4.42; aground
0.09 → 0.03; spread 0.067 → 0.104. Worst held: damage 125.7 → 125.5, lull
91.6 → 110.4 (+18.8 ± 12.0). None worse by two se; lull and distinctness lean
worse by some 1.5 (flagged). Steps 1.96 / 4.71 / 13.2 → 1.65 / 3.48 / 12.0
(marks down the way in are found by the router; fewer searches run to their
limit). The lulls are the endgame's (two or three ships 100–250 m apart,
claiming or roaming, out of each other's sight): left to layers 2–4.
- Tried and dropped: pressing her on until she reaches her deeper mark (held
  hull mended −1.2 ± 0.3 and sustain −0.021, both worse by two se: in the
  storm's option she mends nothing; lull +2.2 ± 6.1).

**Step 3, layer 2 (a place per phase).** A new part, placing.ts (PLACING,
PlaceMemory): as each cap is set she looks over 12 places inside it, 2 a
think, and keeps the best, a new one only if worth 1.2 times hers. A place is
weighed by how deep in by water (the calm field), how near her, cover (land
on some sides, open on most), a narrows (land on two facing sides, open
across), open water and loot near; weights and how early she comes are her
persona's (persona.ts CREWS: a turtle a cove, early; a hunter a narrows,
early; a scavenger the loot, late; a raider loot or a narrows; a homesteader
open water by a shore; a brawler the heart). She makes for it, roaming, from
30 s (by persona) before the cap begins to close (roaming.ts). Held pooled:
damage 130.9 → 130.5 (−0.4 ± 1.9); hull mended 10.63 → 10.26 (−0.4 ± 0.4);
sustain 0.609 → 0.605; lull 92.2 → 84.3 (−7.9 ± 5.9); distinctness 0.162 →
0.169 (+0.007 ± 0.007); stuck 4.42 → 4.53; aground 0.03 → 0.00; spread
0.104 → 0.110. Worst held: damage 125.5 → 127.0, lull 110.4 → 104.4. Steps
1.65 / 3.48 / 12.0 → 1.71 / 3.63 / 12.5.
- Seen: in the endgame the last three claim water 75–290 m apart and never
  roam, so the place acts mostly mid-match. They don't fight at 75 m because
  of `holdBack`: with 3 ships or fewer afloat her will falls by `more` (0.4)
  on top of the phase's restraint (fighting.ts MIND lastFew, more; 0117's
  restraint, 07a6c84), 0.5–0.75 in all in phases 3–5. That is the endgame
  lull's cause; it is a design choice, so it is flagged, not changed.
- Tried and dropped: no new bite of water further than 80 m from her place
  once it is time (held damage +5.8 ± 2.2, distinctness +0.028 ± 0.008, but
  lull +15.8 ± 6.3 and sustain −0.027 ± 0.007, both worse by two se: more
  fights early bring the last three, and their standoff, sooner); turning for
  her place the moment it is time, not at her next roaming mark (held lull
  −0.8 ± 6.1, the rest alike: so this layer's lull gain is within noise).

**Step 4, layer 3 (memory).** A new part, logbook.ts (LOGBOOK, LogMemory):
every think she notes each ship she can see within her notice (land hides
one): where, hull and shield, the gun in her hand, when; and a ship she ran
from, when. Notes fade after 60 s; 8 ships at most. Read: with no guns to
hear, she goes back (the hunt) for a ship she saw lately at half her
strength or less, within 350 m, to where she saw her, once (a hunt given up,
only a newer sighting draws her again); guns by a ship she ran from she lets
be (150 m), and her place is never there; a ship she ran from, no weaker than
she, takes 0.25 off her will to fight her (fighting.ts MIND beaten); her
place weighs the ships she knows near it (placing.ts foes: hunter and brawler
+0.4, turtle −0.4, homesteader −0.3). Only what she saw. Held pooled: damage
130.5 → 131.6 (+1.1 ± 2.1); hull mended 10.26 → 10.56 (+0.3 ± 0.3); sustain
0.605 → 0.610; lull 84.3 → 81.5 (−2.8 ± 5.7); distinctness 0.169 → 0.163
(−0.005 ± 0.007); stuck 4.53 → 4.40; aground 0.00 → 0.02; spread 0.110 →
0.073. Worst held: damage 127.0 → 124.7, lull 104.4 → 95.1 (−9.3 ± 11.3).
All within noise, none worse; it doesn't beat one se on held, so one pass
only (the rule). Steps 1.71 / 3.63 / 12.5 → 1.71 / 3.73 / 13.0.

**Step 5, layer 4 (joining others' fights).** A raider or a brawler who hears
guns (hunter.ts HUNTING standoff, persona.ts) makes not for them but for a
stand 250 m off them on her side, out of the longest gun's reach (240 m),
while they ring, for 25 s at most; she falls on them once they fall silent,
once that is out, or once her log knows a ship within 150 m of them at half
her strength or less (logbook.ts hurtNear). A turtle or a homesteader roams
no nearer than 250 m to guns she hears (roaming.ts ROAMING shy). Held pooled:
damage 131.6 → 129.8 (−1.8 ± 2.0); hull mended 10.56 → 10.57; sustain 0.610
→ 0.609; lull 81.5 → 88.2 (+6.7 ± 5.7); distinctness 0.163 → 0.166 (+0.002 ±
0.008); stuck 4.40 → 4.17; aground 0.02 → 0.02; spread 0.073 → 0.055. Worst
held: damage 124.7 → 127.0, lull 95.1 → 101.8. Tune pooled the other way:
lull −5.1 ± 6.2, distinctness +0.009 ± 0.007. None worse by two se; held
damage and lull lean worse by about one se (flagged); one pass only (the
rule). Steps 1.71 / 3.73 / 13.0 → 1.73 / 3.88 / 14.6; the worst is the first
step of the match, cold (14.7 ms; the next worst 9.4, then 7.5).

**Steps 1–5 together**, held pooled: damage 122.9 → 129.8; hull mended 7.79
→ 10.57; sustain 0.608 → 0.609; lull 88.8 → 88.2; distinctness 0.171 →
0.166; worst held damage 119.5 → 127.0, lull 97.8 → 101.8. The damage and
mending are the loot's; the four layers move the gates within noise. The
endgame lull is held up by `holdBack`'s `more` (fighting.ts MIND; step 3
above), not by where the ships are.

## Not decided / later

- Restage in place (parked).
- Automated parameter search: only after layers 1 to 4, on the pool.
- The manager game: about as far from main as before; its pure career code
  ports moderately, its office UI heavily; restage would serve it.
