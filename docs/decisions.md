Every decision recorded here was made by an AI agent working autonomously on the manager brief (#56). None was
made or approved by the owner, and none is binding: the owner may overturn any of them. The owner's settled
decisions are in #56, section 2.

## 2026-11-15, Phase 0 (#57)

- **Question:** `ship/hull.ts` has a `TIERS` (the transom's panels between its rails), unrelated to the rank's wax
  tiers; the acceptance wants `grep TIERS src/` empty. **Choice:** renamed it `PANELS`, nothing else changed. There is
  no `seal` in `ship/hull.ts`. **Why:** meets the grep with the least change; the name is truer to what it counts.
- **Question:** what the lobby and the end panel show once the career plate is gone. **Choice:** the lobby keeps the
  wheel (top right) and PLAY (bottom right) only; the end panel keeps her place, what sank her and the sea she held,
  its band narrowed to them and centred; the won panel keeps the sunburst and the sea held. Nothing replaces the plate.
  **Why:** D6 deletes the career level; Phase C's `home` and `result` replace these screens.
- **Question:** the `menu.rank` glyph in `ui/glyphs.ts`. **Choice:** kept. **Why:** it is an icon of the UI kit
  (section 3.2 keeps the kit), not the rank screen, and #57 does not list it.
- **Question:** D26 says the world is drawn at 1.0 × CSS size. **Choice:** `frame.ts` `SCALE` 1.5 → 1, and every tool
  that opens a page (`budget`, `hitch`, `audio --cpu`, `capture`, `hero`) now opens the iPad Air's 1180 × 820 at 2
  pixels a CSS pixel (`tools/launch.ts` `DEVICE`), so the gates measure the device's page. **Why:** D26, and the
  gates stand in for the iPad (section 0.2). 1180 × 820 at 1 is within 2% of the pixels 956 × 440 at 1.5 drew.
- **Question:** how the match HUD is laid out for the new page. **Choice:** its pieces keep their CSS sizes and
  corners (anchored to the safe area as before); the sheets (title, lobby, settings, the end) are redrawn in the
  1180 × 820 page, each piece in its present corner. **Why:** #57 asks for each piece in its present corner; CSS px on
  the iPad are about the size they were on the phone, so the HUD's touch targets keep their size.
- **Question:** what file each empty folder holds. **Choice:** `career/career.ts`, `store/store.ts` and
  `campus/campus.ts`, each a comment on what the folder is for and `export {}`. **Why:** the layers test needs a file
  to see; naming no type or table leaves Phases A, B and D free to build theirs.
- **Question:** which `LAYERS` rows to add. **Choice:** `career/`, `race.ts`, `office.ts`, `store/` and `campus/` as
  section 4.1 gives them (`campus/` as `land/`'s row), and now also `race.ts` for `sim/` and `play/`, `office.ts` and
  `race.ts` for `ui/` (section 4.1); test `i2` counts `campus/` as a render folder; test `g` covers `career/`.
  **Why:** section 4.1 states them; adding them once here keeps Phases A and B off the same lines of the test.
- **Question:** the test `j` table of stand-ins once `play/placeholder.ts` is gone. **Choice:** removed `STAND_INS`;
  test `j` now holds for every file in `src`. **Why:** nothing stands in for anything any more.
- **Question:** how to reserve the playtest switches (D42). **Choice:** `debug.ts` names them in its header and in a
  `PLAYTEST` table with whether each is built; asking for one not yet built logs a line saying so. `?screen` is built.
  **Why:** the names are taken in one place, and a playtester is told plainly when a switch does nothing yet.
- **Question:** what counts as an element of the UI layer for `tools/capture.ts`'s page check. **Choice:** every HTML
  element, every sheet's `<svg>`, and every press-able region drawn inside one, with a box; it must lie within the
  page (0.5 px slack). Shapes inside an `<svg>` are clipped by it, so only the regions a finger must reach are checked
  among them (the title's rhumb lines run past the page on purpose). **Why:** that is what can be lost off the page.

## 2026-11-15, Phase A (#58)

- **Question:** where a match's fleet size lives before cards exist (step 1). **Choice:** `Match.ships` (optional,
  `play/match.ts fleetOf`, `SHIPS` by default); the frame is still made for `SHIPS`; `tools/matches.ts` takes the count
  as its third argument. The match types moved from `play/state.ts` to `play/match.ts`. **Why:** the count is the
  match's; state.ts was at its 450-line cap.
- **Question:** where a ship's handling lives in the sim (step 2). **Choice:** `Vessel.fit: Handling` (the seam's
  type, re-exported by `sim/fit.ts`, whose `SPEC` is the tables' ship: SHIP's top, gather, turn, answer, HEALTH's hull,
  spread and reload 1). `afloat(id, ship, fit = SPEC)`; `step(..., fit)` reads top, gather, turn, answer from it (the
  rudder's bite against her own top). Whatever changes a ship's handling mid-race (faults) replaces `vessel.fit`.
  **Why:** one source, carried with the ship through every step; SPEC keeps every result bit-identical.
- **Question:** what `hull` means per ship. **Choice:** her most hull: she puts to sea with it (`whole(most)`), mends
  to no more than it (`hold.ts` caps at `min(use's cap, most)`), the storm wears `storm.damage` of it a second, and the
  HUD's `hullMax` reads it (`state.handling(id)`). A bot reads an unknown hull as the ship's own (`Seen.fit`, `fitOf`).
  **Why:** a sturdier hull should be sturdier in every rule that names the whole hull.
- **Question:** what `spread` and `reload` multiply. **Choice:** what the gun's kind and rarity give (`spreadOf(g,
  hers)`, `reloadOf(g, hers)`), in firing, in a reload she asks for, and on the HUD. A bot's rating of a gun
  (`gunner.ts suits`) keeps the gun's own numbers: the factor is the same for both her guns. **Why:** a ship's guns
  crew, not the gun, is what a card's handling describes.
- **Question:** the ride and the bots' sense of speed. **Choice:** `ride.ts settled` and `ride` take `{ship, fit}` (a
  Vessel) in place of the ShipState, so her heel is against her own top (parameter counts unchanged). The helmsman's
  ram lead and slowing to turn, and the claimer's race to a trail, use the ships' own top and turn. `BOT.outrun`,
  `outran` and the audio's `TOP` keep the tables' top. **Why:** these are her own sailing; the rest are tuning
  constants that read SHIP.top only as a scale.
- **Question:** where a ship's side lives (step 3). **Choice:** `Vessel.side` and `Crew.side` (the crew keeps it once
  she has sunk, so her balls still in flight spare her mate); `Seen.side` for the bots; `createTerritory(count,
  sides)`; `Waters.sideAt` for `atHome` and the claimer. A card-less ship is a side of her own (her id), so every
  card-less result is unchanged. **Why:** each rule reads the side where it already reads the ship.
- **Question:** what "a ball stops on her sidemate's hull" does. **Choice:** the ball comes down on her as today
  (`shot.ts` unchanged), and the strike is dropped in `battle.ts` `deal`: no damage, no strike, no splash. A shell
  bursting on or near a mate harms only the ships of other sides. **Why:** one check, in the one place harm is dealt.
- **Question:** what the bots do about their mates. **Choice:** they never take one for a foe (`perceive`), never cut
  a mate's trail (`prey`), and don't turn end-on to a mate's "ram" (`answer`). They may still fire with a mate in the
  line; the ball stops on her. **Why:** the rules the issue names; masking fire by mates is tuning for later.
- **Question:** the dealt card's captains before step 6. **Choice:** `sim/temper.ts captainOf(seed)`: seed
  `hash(match seed, id)` (the card-less bot's), style as `temper` draws it, Gunnery, Helm and Lookout `20 u` for
  `skill = 0.35 + 0.55 u`, the rest 10. The bots still sail by `temper(captain.seed)`, so a dealt race's bots are
  today's. The player's ship has no captain. **Why:** the brief's "captain from temper(seed)'s mapping"; step 6
  replaces the mapping by `temperOf`.
- **Question:** the dealt card's rules, flight and stances. **Choice:** `play/deal.ts RULES` (storm pace 1, nothing
  banned or spec'd, a point a sinking, no sea-held point, no inspection), `SERVICE` (middling; step 8's
  `sim/flight.ts` should own it), every stance `hunt`. **Why:** none is read yet; they must type-check.
- **Question:** the 24 crew swatches and a side's two. **Choice:** `palette.ts CREW`, twelve hues 30° apart, each deep
  and light (starting values); side 0 vermilion on vermilion; side k ≥ 1 two of the other 23 (`coloursOf`), no two
  sides alike; the side's first ship plain, its second banded; paint the first swatch, canvas the second. **Why:**
  the brief; vermilion stays the player's alone.
- **Question:** a swatch-count constant (the orchestrator's note: Phase B added `SWATCHES = 12` to race.ts).
  **Choice:** `race.ts` gains `export const SWATCHES = 24` (an addition to the seam); `deal.ts coloursOf` reads it, and
  a test holds `CREW.length === SWATCHES`. **Why:** the issue's 24; both branches then agree when they meet.
- **Question:** what scales with the doubled speed (step 4, D13). **Choice:** SHIP.top 27, turn 0.94, answer 5.6
  (both doubled: the turning circle, top / turn, and the steering's damping are unchanged, the turn taken in half the
  time). RAM.least 13, past 9.31, damage 1.1815 (0117's by 27 / 14.5; the most, 45, kept); GUST.speed 24.2, accel 52,
  shed 8.4 (likewise). Also scaled, as their comments derive them: BOT.crawl 0.93 → 1.86 (by top), BOT.rate 0.56 →
  1.11 (by turn), RIDE.heel 0.35 → 0.175 and RIDE.knock 0.07 → 0.035 (the same heel in a hard turn and under a full-
  speed ram), the audio's TOP 27. The guns, HOLDING, the minimap's span untouched. **Why:** the issue's list; the rest
  keeps what the comments promise.
- **Question:** BOT.feel, run, letGo and the roam distances (step 4). **Choice:** feel kept (it already adds her
  speed × 1 s); run 120, letGo 90, roam near 60 / far 160 / arrive 20 kept. New: a temperament's storm margin is
  scaled by her top over `BOT.tuned` (13.5), so it is as many seconds' sailing as before; a roaming mark is kept that
  margin plus her turning radius inside the edge. **Why:** tests/bot.test.ts caught a careful-less captain (margin 13
  m) 23 m outside a 120 m cap at 27 m/s, roaming to a mark at its edge and coming about past it; with both, every
  captain stays 20 m or more inside. tools/matches.ts 3 (seed SEED), before → after: race 431/431/435 s →
  408/391/381 s; first shot 6.2/6.1/5.9 s → 4.4/2.3/3.5 s; sunk shot/ram/storm 78/1/0, 74/4/1, 75/3/1 → 77/2/0,
  72/7/0, 75/2/2; a gun found, median 10 s → 5 s; loops closed 212–277 → 516–700; stuck 28–32 → 26–37 ships, none
  aground. Not otherwise tuned (no batches of races).
- **Question:** the storm's pace (step 4). **Choice:** `createStorm(seed, depth, plan = { pace: PACE.storm })`,
  `handling.ts PACE.storm = 1` (a starting value); pace multiplies every phase's wait and close; `play/setup.ts` passes
  the card's `rules.storm`. **Why:** the issue.
- **Question:** tests whose set-ups assumed 13.5 m/s. **Choice:** each set-up rescaled, no bound loosened in meaning:
  sailing's course test runs 810 m (60 s × 13.5 / top: a fixed course vector means less further round the planet); the
  shore-slide rates are shares of her top; "led with no spread" goes out to 150 m (from 170: one running at 27 m/s
  from 160 m is led past the cannon's 200); the gunner's far test runs 6 s (she reaches scatter range sooner); the
  claimer's trail is laid in 7.5 s (the same 200 m); the assist's 5° test asserts the assist never lays on her and
  few balls strike past 100 m (nearer, a ship crossing at 27 m/s sails into half the balls laid just ahead of her).
- **Question:** the debug sea about her (`?atsea`) once PLAY deals cards. **Choice:** it clears card-less, every ship
  a side of her own. **Why:** its lashed ships are targets to shoot.
- **Question:** when a race is over and what `won` means (step 5). **Choice:** `sim/match.ts oneSide`: over once every
  ship afloat is of one side, or none is (`Report.sideOf`, a ship her own side without it). `won` is the race ended
  with her afloat (her mate may be afloat too); sunk, she always spectates, watching her mate first if afloat. **Why:**
  the issue; a lone-ship match is unchanged (each her own side).
- **Question:** where the result is made (step 5). **Choice:** `play/result.ts createTally`, kept by `state.ts`, frozen
  (`state.result()`) at the step the race ends; runRace and the live path read that one result, so they cannot part.
  The referee's place, once over, is the order's. `RaceResult` unchanged (no seam fields added).
- **Question:** finishing order and `seaHeld` (step 5). **Choice:** `result.ts finishing`: afloat first by sinkings
  credited, then her share now, then lower id; then the sunk, the last sunk highest. `seaHeld` is her share now if
  afloat, else her share the step she sank (before her water is freed).
- **Question:** what `hits` count (step 5). **Choice:** `fired` each ball loosed (a scatter's every ball); `landed` and
  `taken` each ball or burst that struck a ship of another (a ram is not a hit). Strikes on a sidemate do nothing and
  are not reported, so never counted.
- **Question:** forfeit (step 5). **Choice:** only the player's ship (`card.ships[PLAYER].forfeit`): at `start` she is
  scuttled at second 0, cause `'forfeit'`, no sinker, and so placed last. A bot's flag is ignored. `player.ts
  End.how` gains `'forfeit'` (no cause mark drawn).
- **Question:** runRace on a flat sea (step 5). **Choice:** `play/race.ts runRace(card, planet, waters, pilot?)` with
  `world/swell.ts flat`; no rule reads the sea's height (it feeds only `ride.ts` poses). `tests/race.test.ts` runs the
  live path on a wavy Hull with her helm in hand and replays the recorded helm through runRace: the same result to the
  bit. A race still on 600 s after the storm's last close throws.
- **Question:** skip to result (step 5). **Choice:** `game.skip()` (only once she has sunk): each frame runs the
  frame's steps and then more until `SKIP = 8` ms of it have passed or the result is in; the moments of skipped steps
  are not answered by the camera. A new Tap `'skip'` (sunk and spectate → spectate); a banner between WATCH and LEAVE,
  a disc beside the anchor while watching; `?skip=seconds` taps it (debug.ts).
- **Question:** node and the Worker (step 5). **Choice:** `tools/league.ts` runs the race in node, in the league's
  Worker and on the page's thread. Worker and page agree to the bit; node does not, from the planet's ground on: V8's
  `Math.sin`, `cos`, `atan2`, `exp` and the like differ in their last bits between node 26.11 and Chromium 156. Left
  open as #62 (accept per-engine results, or our own math in sim and world); the tool still exits 1 on it.
