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
- **Question:** #62, node and Chromium differing in the last bits. **Choice (the orchestrator's ruling):** a race's
  result must be identical within one engine only. `tools/league.ts` checks the Worker against the page, and node
  against node (the race run twice, each on a planet built afresh), and exits 1 only if either pair differs; where
  node and the browser part is still printed, for the record. No hand-written maths in sim/ or world/. **Why:** the
  game runs races only in the browser, and the journal stores each RaceResult rather than re-running it.
- **Question:** Skip to result with 80 ships ran about 4× real time. **Choice (the orchestrator's ruling):** Skip runs
  under the parchment passage (`ui/passage.ts`) with the world not drawn and a progress line, in slices of up to 25 ms
  a frame, then the parchment lifts onto the result. Watch keeps the world drawn as before. **Why:** nothing is drawn
  under the parchment, so the race may take three times the slice the live match may.
- **Question:** `play/state.ts` was at 447 of 450 lines before steps 6–9 add to it. **Choice (the orchestrator's
  ruling, split by responsibility):** each ship's orders for a step (the bots' thinking) moved to `play/orders.ts
  command` (`Bridge` in, helms and orders out; `Hand` is what a bot sails by); what is kept aboard each ship and how
  the ships are drawn between two steps (`Aboard`, `Wreck`, the sea's colours, `drawnShips`, `drawnPose`) to
  `play/aboard.ts`. state.ts keeps the step's order and the match's bookkeeping. Results unchanged to the bit.
- **Question:** how a card's captain's stats reach the bot (step 6). **Choice:** `Temper` gains `gunnery`, `helm` and
  `lookout`, each on skill's scale (0.35 + 0.55 u); `temper(seed)` sets all three to its skill, so a card-less bot is
  today's to the bit. `temperOf(captain, clock, length)` draws temper(seed)'s numbers from the captain's seed in her
  own style, then: Gunnery for every skill read in `gunner.ts` (aim error, spread, the ring's weave); Helm for the
  helmsman's seeing a ram and for `evading`; Lookout for the notice range (`noticed`: notice × (0.8 + 0.4 lookout)) and
  `reactTime`; Nerve shifts `fight` and `aggro` by 0.4 (u − ½) and `run` by (u − ½) of itself; Stormcraft shrinks
  `margin` by (u − ½) of itself; Stamina's fall (`tired`) comes off Gunnery and Helm points; the general `skill` is the
  mean of the three. The shifts are `sim/handling.ts CAPTAIN` (starting values). A stat of 10 changes nothing, so
  captainOf's mapping sails as temper(seed) but for the skills' last bits (a test holds them within 1e-12). **Why:**
  every read named in the issue moves; a middling stat is today's bot.
- **Question:** the issue says `notice` "falls" with Lookout and Helm grows "the ram-evasion distance". **Choice:**
  Lookout widens the range at which she notices a ship and shortens the delay before she fires on one just seen (her
  "answer"); Helm raises the chance of seeing a ram coming (`seesRam`) and how much she wants to get clear
  (`evades`). The tests show those directions. **Why:** a longer notice range is the better lookout; no distance in
  the sim reads her helm, and adding one would change every card-less result, which must stay identical.
- **Question:** where the temper is refreshed by the clock and where the race's length comes from (step 6).
  **Choice:** the bot (`play/orders.ts Bot`) carries her captain and temper; `command` makes it again once a whole
  second from half the race's expected length (`sim/storm.ts closedBy`: the storm's last close on the race's pace).
  `think` takes `Hand` (seed and temper) in place of the seed; `Sea` did not gain the clock, as nothing in the sim reads
  it once the temper is made outside. **Why:** "made once at launch, refreshed only by the clock", with no per-step
  random draws.
- **Question:** where parts, faults and the flight live (steps 7, 8.1). **Choice:** `sim/wear.ts` (parts, wear, faults,
  leak) and `sim/flight.ts` (the stop's state machine, FLIGHT and SERVICE, moved there from `play/deal.ts`), both pure;
  `play/upkeep.ts` keeps each carded ship's parts and stop and the calls, stepped after the fighting each step;
  `state.ts` only wires it. Wear counts the hull points of the blows she took that step (not the storm's). A card-less
  match keeps no upkeep, so its results stay identical. Dealt cards now carry six parts each `WEAR.dealt` (0.85)
  reliable and new. **Why:** `state.ts` stays under its line limit, and each rule is tested on its own.
- **Question:** what a botch's draw is keyed by and what "under fire" means (step 8.1). **Choice:** one draw per job
  begun, keyed by the race's seed, her id, the jobs begun in the race and in the stop; under fire is a blow taken in
  the last FLIGHT.fire (5) s. **Why:** seeded and stable, no per-step draws.
- **Question:** whose stance counts, and what a call's lead is (step 8.2). **Choice:** only a crewmate's (a side's
  second ship, odd id) stance weighs her options; a side's first ship sails by her style alone. A crewmate's lead is
  ship 2k: the player's calls for side 0; other sides' first ships give none. What ship one "fights" is her bot's foe,
  or for the player the last ship she struck within 20 s. The calls are options appended to the bot's list (shadow,
  attack, hold) at weight `CREWMATE.call` (4), above flee and under the storm. **Why:** the card has a stance for every
  ship, but D39 makes it the crewmate's; appended options scoring zero keep card-less results identical.
- **Question:** `player.ts` needs the race's part, job and call types (step 8.3). **Choice:** `race.ts` added to
  `player.ts`'s row in tests/architecture.test.ts (types only). **Why:** the HUD names parts and calls as the seam does.
- **Question:** how the HUD shows the flight's job, the calls and failed parts with no words (step 8.3). **Choice:** a
  glyph each (`ui/glyphs.ts`: `hud.flight`, `call.*`, `part.*`; the jobs reuse the repair kit's, Gust's and the
  shield's); the flight's disc sits over Gust, pale outside her side's water, a gold ring filling while the gull comes,
  shaking on a botch; the crewmate's slip carries an empty 42 px headshot frame (`hud.headshot`) for Phase C's gulls.
  **Why:** the HUD has no words (the UI sheet), and each glyph is the same one the cards will use.
- **Question:** the four teaching folios' form and when each shows (step 8.3). **Choice:** `ui/teach.ts`, the
  settings folio's frame (`screens.ts folio`, now exported), centred over the match, drawn without words: the crewmate
  and no friendly fire when she first sails with one; the calls once that one is closed; faults on her first failed
  part; the flight the first time she may call it. One at a time, each once on the device (`portolan.taught`), put away
  as her match screen is left. **Why:** "in the form of the existing ones"; the only folio is the settings one.
- **Question:** how Skip runs under the parchment (the orchestrator's ruling, done). **Choice:** the passage
  (`ui/passage.ts`) takes a `Running` (over, progress, lifted): it holds until the race is over (`wayHome`'s `ready`),
  a gold line under the rose filling with the ships sunk since the tap; while held, `flow.hiding` makes `main.ts next`
  return no snapshot, and the stage skips the render but counts the frame; `play/game.ts SKIP` is 25 ms; as it lifts the
  flow goes to the result. Headless: 80 ships' race to its end in some 5 s, no draws under the parchment.
- **Question:** when a new planet is made (step 9). **Choice:** on the way home from a race (LEAVE, under the parchment
  that already covers it: `flow` home → `main.ts restage`), so every PLAY is on a planet no race has used; the first
  race after load is on the planet the page opened on. **Why:** the parchment is the one cover the game has for a
  change of world, and the ground's bake (some 3–5 s) fits under it; PLAY stays the instant cross-fade it is, and the
  hitch gate (a fresh lobby's PLAY) measures what it did.
- **Question:** the new planet's seed (step 9). **Choice:** `hash(first, n) % 2^20` (world/random.ts), `first` the
  page's planet, `n` the count of planets made since load. **Why:** deterministic from a counter, independent of the
  card's dealing; under 2^20 because `noise3.ts` multiplies the seed by 2654435761 and keeps every bit only below 2^53.
- **Question:** what is made once and what per planet (step 9). **Choice:** per planet: the world, frame, matches,
  sounding Worker (the last terminated: `watersOf` gains `close`), game, referee and the coasts. Once: renderer,
  canvas, loop, input, stick, HUD, globe, flow, audio. `main.ts play` keeps the planet's in one `on`; the input, HUD,
  minimap and globe read it through getters (`createHud`, `createMinimap`, `createGlobe` take `() => Coast[]`; the
  minimap re-bakes its islands when the list changes), the audio its height through `s.world`. `Stage`'s world,
  start, anchors, ready and matches and `Played`'s game and referee are getters. The globe is kept, not remade (the
  brief listed it per planet): it holds DOM and listeners, and reads only the coasts. **Why:** nothing made once
  holds a planet, and no module-level variable holds one.
- **Question:** freeing the frame (step 9). **Choice:** every system gets `dispose()` through three's public dispose
  methods (`gpu.ts release`: geometries, materials, InstancedMesh, textures, render targets, storage attributes, compute
  nodes, RTT and pass nodes, RenderPipeline); `frame.dispose` calls them, allowed by architecture test f2. Three
  things needed care: three's backdrop sphere for `scene.backgroundNode` is freed by disposing that node
  (`sky.dispose`); `fxaa` makes its input's RTT itself, so the frame makes it (`convertToTexture`) and frees it; and a
  viewport depth or colour node keeps a copy of its texture for each target drawn into, so the sea reads one node of
  each (`.sample(uv)`, three copying each once a frame where it had copied depth three times) and frees each copy by
  `getTextureForReference(target).dispose()` for the eyes' scene targets and the canvas's. After `frame.dispose`
  three holds 0 textures and 1 geometry (its shared quad). Nothing three keeps was beyond its public interface, so no
  `decision` issue was opened.
- **Question:** what tools/restage.ts judges (step 9). **Choice:** ten restages onto one seed (the page's own;
  `--fresh` for the game's own next planets, whose geometries differ by their islands), each drawn 2 s; geometries,
  textures and the heap less V8's compiled code (a heap snapshot's `code` nodes) within 5% from the first to the tenth.
  **Why:** the heap as V8 reports it grows some 0.3 MB a restage, all of it compiled code (machine code, feedback
  vectors, inline-cache handlers) as the game's code warms; the objects the page keeps grow some 17 KB a restage
  (0.4% over ten). Both are printed.

## 2026-11-15, Phase D (#61)

- **Question:** what the campus planet is (section 1). **Choice:** a race planet's generator with a campus flag
  (`createPlanet(seed, true)`, `world/rookery.ts placeCampus`): the same radius, the same land, sea, sky and bake; one
  main island (of three round draws with no offshore rock, the one whose terraces stand lowest) and three to eight
  islets, these only for the view from orbit. **Why:** the rookery is seen with the race's own eye and look, so it
  reuses every system; a smaller planet would need its own sea and eye tuning.
- **Question:** where all nine plots stand. **Choice:** round the main island's coast, each on a terrace levelled into
  the planet's mound (`terraced`: cut at most 2.5 m into the hill, eased over 4 m round it), the plots' ground kept
  clear of rocks, palms and shrubs. The test bounds a terrace at 10 m over the sea (seed 1234 has one at 9.7 m).
  **Why:** a building on a slope would float or sink; levelling the ground keeps the buildings' forms flat-bottomed and
  their plinths short.
- **Question:** where `Building` and `Rookery` (what a crew's campus is) live before Phase B's office. **Choice:**
  `world/rookery.ts`, with each building's footprint and its heights per level (`FOOTPRINT`, `TALL`); Phase B's
  `office.ts` may re-export them. **Why:** the planet's placement needs them, and world/ is below everything.
- **Question:** how a building under way is drawn and what it takes. **Choice:** the next level's form inside
  scaffolding, cut off at the share built (a mask on its height); the share is an input (`under[b].share`) beside the
  days left. **Why:** Phase B gives only the day work is done; the share is what is drawn, and Phase C has both.
- **Question:** screen anchors for the UI (section 1). **Choice:** `play/lens.ts onScreen` from the snapshot's eye
  (`play/rookery.ts anchors`), not a new member of the frame. **Why:** the eye is the snapshot's, so the projection
  already exists in play/; architecture test f2 (the frame's callers) is unchanged.
- **Question:** the eye. **Choice:** the space eye over the campus, switched to the air eye under 160 m above the sea,
  as the arrival does; orbit by yaw and tilt about a focus, eased (`VIEW`). **Why:** the space eye's near plane is 50 m,
  too far to look at a building.
- **Question:** the gulls over the flight loft. **Choice:** a simple flock in `campus/life.ts` (circling, wings beating
  in the vertex shader), the seam where the flight-gull model goes when it lands. **Why:** the parallel agent's model
  was not on manager; the flock takes a centre and a radius only.
- **Question:** what runs on the campus. **Choice:** no game, referee or sounding; `restage(seed, then, true)` keeps the
  last race planet's start and matches; `racing()` restages a race planet before PLAY if the campus is staged.
  **Why:** the rookery is a view; a race restages anyway.
- **Question:** what the budget and hitch tools judge for the rookery. **Choice:** two views in `tools/budget.ts`
  (from orbit and near the foundry; some 59 draws and 323k triangles) and a window in `tools/hitch.ts` (the view eased
  between buildings, levels changed); none of the campus is made on a race planet, so the race views are unchanged
  (the map stays at 998k). **Why:** the brief asked for both to hold on the rookery's own view.
- **Question:** how a planet's seed names its biome, and keeps palm keys (section 3). **Choice:** `world/biome.ts`:
  the biome is `BIOMES[floor(seed / 2^20) % 6]`; the ground's noise is seeded by `groundOf(seed)`: a palm keys seed
  (any under 2^20, every seed the game made before) is its own, so today's planets are the same to the bit; any other
  by `hash(seed mod 2^20, biome) % 2^20` (noise3.ts keeps every bit only below 2^53). A new planet per race is
  `anyPlanet(hash(first, n))`, every biome as likely; the page's first planet is still today's. **Why:** every test,
  every capture and `tools/matches.ts 3` stay as they were on palm keys, and the seed alone still makes the planet.
- **Question:** each biome's sailing rule and its first numbers (section 3). **Choice:** one rule per biome, read by
  the sim through the helm and the sea (`sim/rule.ts`, numbers in `handling.ts RULES`), none on palm keys: coral atolls'
  reef (in water under 6 m her way is 0.62 of her top), basalt fjords' lee (within 45 m to leeward of an island over
  12 m tall, her way falls to 0.55 at the cliff's foot), the mangrove delta's roots (in water under 8 m a gust drives
  her 0.4 as hard), the volcanic arc's ash (a bot's notice range by her Lookout, 0.62 of it at a middling one, 0.7 to
  1.3 across the range), and chalk downs' tide (the depth the sim reads rises and falls ±1.3 m over a 150 s period).
  **Why:** each is a starting value to tune in play, not by batches of headless races; `tests/biomes.test.ts` holds
  that each changes the sim on its own planet and on no other.
- **Question:** whether the tide moves the drawn sea (section 3). **Choice:** no: the tide is applied to the depth the
  sim reads (`rule.ts tided`), not to the water drawn. **Why:** the sea's level is a constant through the frame, the
  water, the wake, the ground's bake and the sounding; moving it is a frame-wide change for a few metres of shallows.
  The tide shows in what she can sail over, which is what it is for. Left for Phase C's plan screen to say.
- **Question:** the full map's triangles once the biomes added trees and taller ground (section 3). **Choice:** levels
  of detail in `land/`: an island's ground at a coarse grain (land.ts COARSE: spokes 3.6, rings 3) past 500 m of the eye
  (not the nearest island), and its rocks at a third, coarser level (`rocks distant`) past it; the 1M map limit is not
  raised. **Why:** from orbit the fine ground's triangles are under a pixel. Palm keys' map went from 910k to 816k
  triangles; every biome's is under 900k.
- **Question:** where the gulls set out from, and what the sim knows of them (section 2). **Choice:** the edge of her
  side's water nearest her when she called (`play/flights.ts edgeOf`: sixteen bearings, 4 m steps to 360 m), found
  once the first time the stop is drawn and kept while it lasts; `Snapshot.flights` gives each stop's `from`,
  `coming`, `job` and `botched`. The sim gains nothing; the frame keeps the gulls flying off once a stop is gone.
  **Why:** the brief's "the drawing reads the stop events and the ship's pose"; `tests/flights.test.ts` holds that
  reading them changes nothing.
- **Question:** the gulls' size and the stern's station (section 2). **Choice:** a gull about 2.1 m beak to tail, 4 m
  across the wings; for a gust they hover in a row off her stern rather than standing on the poop. **Why:** at the
  chase's distance a life-sized gull is a few pixels; and the poop is under 4 m across, too narrow for four beating
  wings.
- **Question:** a planet's traits for the plan screen (section 3). **Choice:** `world/biome.ts traitsOf(seed)`: the
  biome's name, its title, its rule and a line naming it, from the seed alone; `main.ts` puts it on the PlanetSketch
  when Phase C makes one. **Why:** the sketch is made from `world/`, and no planet need be built to name its biome.
- **Question:** a crew's campus once planets have biomes. **Choice:** a campus is always palm keys
  (`createPlanet(seed, true)` takes `BIOMES[0]`; its ground still from `groundOf(seed)`), and `placeCampus` takes the
  biome's laying as `placeIslands` does. **Why:** the rookery's plots and terraces were tuned on palm keys' hills; a
  cliff or a cone under them is a change to the rookery, not to the biomes.
