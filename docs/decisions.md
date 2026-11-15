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

## 2026-11-15, Phase B (#59), sections 1–3

- **Question:** the bosun's Performance stat and a part's performance, when test `g` bans the word `performance` in
  `career/` (it is a browser global). **Choice:** named `perf` in code (`perf`, `perfMax`, the bosun's `perf`); screens
  show "Performance". **Why:** keeps test `g` whole without weakening it.
- **Question:** how many crew swatches the career deals colours from (palette.ts names none yet, and career/ may not
  import it). **Choice:** `race.ts` gains `SWATCHES = 12` (added, nothing renamed); the palette's crew swatches must
  number that many. **Why:** both the career and the drawing read the seam; 12 swatches give 66 pairs, enough for
  forty crews a league with the player's pair taken out.
- **Question:** how a torn tail leaves the store, when the port of section 1 has no way to drop the newest entries.
  **Choice:** the port gains `truncate(from)`; a load that drops a tail cuts the store back after telling the player.
  **Why:** otherwise the torn entry would sit before every later one and be reported lost on every load.
- **Question:** how a snapshot's tail is checked once the entries before it are compacted away. **Choice:** a
  snapshot's text is the canonical JSON of `{ state, tip }`, `tip` the journal's sum at its seq. **Why:** the chain of
  the entries after it starts from that sum.
- **Question:** is `Snapshot` journaled? **Choice:** no: `career/session.ts` writes the snapshot and journals nothing.
  **Why:** it changes no state; replay needs no record of it.
- **Question:** a command journaled but its snapshot write failing. **Choice:** the command stands (`snapshotFailed`
  is reported); the next checkpoint tries again. **Why:** the journal already holds it, so nothing unsaved goes on.
- **Question:** when compaction runs. **Choice:** after each backup (each season's end, before a migration, the
  player's backup), dropping entries before the previous snapshot. **Why:** section 1 says after a snapshot and a
  backup; between backups the journal keeps every entry, so the whole-journal replay stays possible until then.
- **Question:** when the whole journal may be replayed. **Choice:** only if its first readable entry is seq 1 (not
  compacted) and every readable entry carries the present tuning; a journal of nothing but a torn first entry loads as
  the beginning with that action reported lost. **Why:** D36, and never a silent new career.
- **Question:** where the world seed lives and when the world is made. **Choice:** `Found` carries the seed (main.ts
  draws it) and makes the world; the first journal entry is `Found`. **Why:** rivals' colours are dealt around the
  player's (D32), so the world cannot exist before the player picks; replay needs only the journal.
- **Question:** age and the calendar. **Choice:** a season is a year of a gull's age: `YEAR` = 10 × 14 + 30 = 170 days.
  Race days fall on the season's start + 14, 28, … 140; its end on the last race day, after the race. **Why:** gulls
  age, grow and retire once a season, as section 2.2 reads.
- **Question:** what the player's gull is (D8, D35). **Choice:** a manager whose stats are all 0 and never read, aged
  35 at founding, manager reputation 10 (*starting values*). **Why:** a gull with a name, face and record, and no stats.
- **Question:** names the player gives. **Choice:** 1 to 32 (crew) or 20 (gull) letters, spaces, hyphens and
  apostrophes; refused if it holds a banned word (D34) or a word of another crew's name. **Why:** the owner banned the
  word; crews never share a word.
- **Question:** a gull's potential's form. **Choice:** each gull holds `ceiling`, their stats at peak; potential is
  its stars; growth moves each stat toward its ceiling. **Why:** "each stat moves toward its potential value" needs a
  value a stat.
- **Question:** Persuasion's size (section 2.1 says only what it does). **Choice:** the first offer within 30 days of
  the scout's report gives +1 patience with chance u. **Why:** a stat shown must change something (D15).
- **Question:** the manager stats section 6 names without numbers. **Choice:** Talent Eye weighs potential
  `0.2 + 0.6u`; Finance commits `0.25 + 0.5u` of the coin above the floor; Development sharpens the yard's split by
  the exponent `0.5 + 2u`; Tactics takes the best race-plan choice with chance `0.4 + 0.6u`; Politics sways
  `reputation × u` (`career/leadership.ts`). **Why:** each stat in one pure function with a direction test, for the
  rivals' agent to call.
- **Question:** Mentor's "+0.25 growth". **Choice:** the young captain's growth × 1.25. **Why:** growth is a rate.
- **Question:** morale's moves section 2.3 names without sizes. **Choice:** result `2` a place of the crew's standing
  against its target, to ±6; wage `4 × (wage / ask − 1)`, to ±2 a race; bond `+0.5` a level a race. **Why:** small
  steady moves next to the named ±10 talks.
- **Question:** the thirty traits. **Choice:** 32 in `career/traits.ts` (the nine required and 23 more over the
  conditions named), five clashing pairs never held together; a season's end gains (8%) or loses (6%) one. **Why:**
  section 2.3.
- **Question:** a command kind no section handles yet. **Choice:** refused with code `unavailable`; a handler that
  throws is caught and refused as `fault` (the tests hold every generated command clear of it). An event kind with no
  handler throws inside Advance (caught the same way). **Why:** `apply` never throws, and no command is guessed at.
- **Question:** debug commands in the journal. **Choice:** `apply` takes `{ debug }`; replay applies with debug on
  (only accepted commands were journaled). **Why:** D42 says they are journaled like any other.
- **Question:** contracts at the start. **Choice:** each at the gull's ask in their league, ending by seed within the
  length they ask (young 1, middle 2, old 3 seasons), half with a break clause of 8 to 20 races' wage; captains a podium
  bonus of half a race's wage and a sinking bonus of a tenth. Elders and the player hold a contract of no wage and no
  end. **Why:** varied expiries so the first off-season's market is alive.
- **Question:** what a new shipwright knows at the start. **Choice:** `components` stays empty until section 8's
  `career/components.ts` exists; its agent deals `3 + round(stars)` (`staff.ts componentsKnown`) at founding and to new
  shipwrights. **Why:** the components are section 8's data.

## 2026-11-15, Phase B (#59), sections 4–7

- **Question:** how many crew swatches (the orchestrator's ruling on the entry above). **Choice:** `race.ts`
  `SWATCHES = 24`, matching #58 step 3's 24 palette swatches; the deal is unchanged (every unordered pair but the
  player's, shuffled by seed: 276 pairs, forty a league). **Why:** one count on both sides of the seam; the career's
  deal and Phase A's palette must agree.
- **Question:** what a crew knows of a gull, and since when. **Choice:** `gull.known[crew] = { day, last, by, used }`:
  the report's day, stars at the last season's end (the arrow), the scout who reported (null when signed or met), and
  whether that scout's Persuasion was spent. A crew knows its own staff without a report. **Why:** the arrow and
  Persuasion's 30-day window both need the day and the scout; per-crew so rivals' knowledge is the same data.
- **Question:** patience, where section 5 leaves it open. **Choice:** kept on the gull, not per crew. Each lowball
  (wage under 0.8 × ask) costs one when answered; at 0 the gull refuses every offer of that day, sets `silentUntil` =
  day + 30 and patience back to 3. Persuasion's +1 caps at 4. Signing resets it to 3. **Why:** the rivals bid at
  least 0.8 × ask, so only a player's lowballs spend it, as the spec intends; one number is easier to show.
- **Question:** when answers come. **Choice:** 2 days after a free agent's offer; 7 after an approach to another
  crew's gull (its crew is mailed `approached`), so the player can renew first. Offers due the same day are answered
  together: of those accepted the best score signs; with none, each offer from 0.85 is countered and a rival meets its
  counter at once if its manager's Finance and Negotiation allow (ask × 1.25 at most); the player's counter lapses
  after 7 days. Later answer events for a talk already answered do nothing. **Why:** one answer per gull per day keeps
  "the highest offer wins" without an auction; the week gives the defending crew its renewal.
- **Question:** the last 60 days and pre-contracts. **Choice:** `closing` (season end − 60) and `silence`
  (season end − 30) are events. From `closing`, gulls whose contracts end this season may be approached without a
  break clause; a signing moves them at once (no pre-contract). At `silence`, those offered no renewal lose morale
  once (`silenced`). **Why:** no pre-contract state to keep consistent; the race calendar still runs on.
- **Question:** a counter's shape. **Choice:** raise the wage to the least that scores 1 (binary search to 1.2 ×
  ask); failing that, at the most money, a captain's status raised to ship, then the length made the asked one; null
  (a refusal) if nothing reaches 1. **Why:** section 5's order (money, status, length) with numbers.
- **Question:** wants' satisfaction numbers. **Choice:** money = (wage + fee/races + bonuses expected) / ask, capped
  1.2 (podium expected 0.06 a race, sinking 0.4); a reserve post 0.3; league one below 0.6, more than one 0 under
  contract and 0.4 free; ambition 1 + (crew reputation − the gull's marketability, a manager's reputation) / 50;
  security 1 − 0.35 × |seasons − asked|; facilities the school building's level / 3; home 1 or 0.5 away. Weights
  0.5, 0.3, 0.2. Level of a gull: their crew's league, a free agent's by stars (≥3 League One, ≥2.1 Two). **Why:**
  section 5 names the wants and weights; these make the ask score exactly 1 for an average crew.
- **Question:** what an offer names, and seats. **Choice:** `Offer.replaces: number | null`: the one whose post they
  take (dismissed with the season's wage on signing). With none, an open seat of the role and status must exist
  (`career/seats.ts`): the player's ship one has no captain seat. **Why:** a full crew must say whom a signing displaces.
- **Question:** a manager's post. **Choice:** `Staff.manager: number | null`; managers are hired only by elders
  (OfferContract refuses managers and elders). An elder hires the best manager whose reputation fits the league (75, 50,
  0 for Leagues One to Three): free agents first at equal standing, or poaches a lower league's (that crew then hires
  in turn), or offers the post to the player if their reputation (70, 45, 0) reaches it and is at least the best
  candidate's. An elder never takes back the manager it just sacked. A poached manager's break clause, if any, is
  paid to their crew as for any signing.
  **Why:** D22; the cascade fills every post in one step.
- **Question:** the sacked player. **Choice:** Advance is refused while sacked; the offers shown don't lapse; every
  open post that may offer does, and always the League Three crew whose elder trusts its manager least. The last offer
  cannot be declined. **Why:** a career never stalls with no crew.
- **Question:** TakeJob. **Choice:** the player sails the new crew's ship one; its stronger captain sails two and the
  weaker is released; its manager goes to the free agents; both crews' talks end; the old crew's elder hires; colours
  and emblem stay with the old crew. **Why:** D22; the player is always ship one's captain.
- **Question:** the rival managers' table. **Choice:** each crew reviews every 7 days, first reviews staggered by crew
  id over the first week; rows fill, replace, renew, poach, scout in an order and spending share set by personality
  (`TUNING.rivals.personalities`); a report runs fill, replace and poach at once. Bids: ask × (1 + Negotiation's
  share) for gamblers × 1.1, ceiled; length by personality (young/other); a break clause unless Negotiation rolls
  ≥ 0.5. Worth: Talent Eye mixes stars and potential (youthBuilder weighs potential 0.2 more). Rows of parts,
  buildings and patrons join `ROWS` in `career/rivals.ts`. **Why:** section 6 in one table; same checks as the player.
- **Question:** wordings, and mail to rivals. **Choice:** `post` mails only the player's crew (or all, crew null), the
  wording picked by `seeded(seed, mail id)` of 2. **Why:** rivals read state, not mail.
- **Question:** the young each season. **Choice:** 150 free agents aged 16–19 of 0.5–1.5 stars, roles in the start's
  shares, colonies even, on the 'young' stream. **Why:** section 5's number; low stars so potential matters.

## 2026-11-15, Phase B (#59), sections 8–11

- **Question:** where this part is published (the shell guard bans force pushes, and manager-b had to be rebased onto
  Phase A). **Choice:** the orchestrator's ruling: the rebased branch is pushed as `manager-b3`, and every later commit
  too; origin/manager-b is left as it was. The part 4 agent starts from manager-b3. **Why:** no force push, no lost history.
- **Question:** what DealComponents names. **Choice:** `{ type, slot }`: the draft is of one type; dealing a new type
  starts a new draft. Each slot is dealt three cards seeded by (seed, crew, its design count, slot, deal, type), so no
  state but the cards is kept; one redeal a slot. **Why:** the cards depend on the type's pool; seeded draws use no stream.
- **Question:** the components table. **Choice:** 54 (`career/components.ts`): each type and tier has a steady gain, a
  sound one (reliability) and a grey one (risk 0.08 × the tier's scale 1, 1.8, 2.8, for about twice the gain); odd
  types trade the steady one for a quick one (fewer days, more Coin). Sails, rigging and keel tiers open by the test
  tank's level, rudder, hull and mounts by the foundry's. A shipwright knows `componentsKnown(stars)` of tiers 1–2,
  dealt by `seeded(seed, 'comp')` in makeGull. **Why:** section 8.2 as data; no stream so the world's draws are unchanged.
- **Question:** a design's numbers. **Choice:** start = the crew's best of the type + shipwright's type stat × 8 +
  components + supplier's start; maximum + 100 headroom; reliability 0.5, maximum 0.8, plus components and supplier;
  risk their sum to 0.9. Cost = type base × tier factor (1, 1.6, 2.4, by the highest tier used) × supplier's cost +
  components' Coin. Days 14 × Speed × the loft's factor + components; build 7 − factory level. Accuracy draws the
  final perf and max on stream `design:<crew>`; Innovation may teach an open component the shipwright lacks. **Why:**
  section 8.3's terms with numbers the owner can tune.
- **Question:** FitPart with ship null. **Choice:** refused (`bare`): a ship always carries one part of each type, so a
  part comes off only by fitting another (it goes to the spares, or swaps between ships). **Why:** a ship with no keel
  cannot be raced; the invariant holds by construction.
- **Question:** a new part and the two ships' politics. **Choice:** a part from the spares is new if it beats the other
  ship's of its type; `lastNew[type]` records the ship; a second in a row to ship one costs ship two's captain 5 morale;
  `flags['newPart:<crew>']` holds the day for section 12's dilemma. **Why:** section 8.6.
- **Question:** the yard's reckoning. **Choice:** closed form from `yardDay` to now (`yardTo`), called before anything
  reads or changes parts: points restore fitted parts' condition first, the most worn first, then the split's shares;
  bosuns' factors are read when reckoned. **Why:** D41; condition only rises between races, so the closed form is exact.
- **Question:** a confiscated part. **Choice:** the ship fits the crew's best spare of the type, or a stand-in
  (perf 300, reliability 0.7, not spec); the race's points are struck from the standings; fined (1 + risk) × 20% of
  its design cost. **Why:** the invariant (one part of each type a ship) holds and the penalty is still felt.
- **Question:** the season's carry-over. **Choice:** designs for next season whole; other parts × 0.6 of perf and
  maximum, risk stripped, condition full; fitted parts and the best spare a type kept; spec types replaced by standard
  parts, and a standard part whose type leaves spec becomes ordinary at its numbers. A rival refits its best. **Why:**
  section 8.7; spares are pruned so parts don't pile up over seasons.
- **Question:** suppliers' window and memory. **Choice:** chosen while `round === 0` and before race day, once a trade,
  paid once; the three cards are seeded by (seed, season, crew, trade) so nothing is stored but the choice;
  `suppliersCleared` at the season's end. With none chosen, terms are even. **Why:** section 8.7's off-season choice.
- **Question:** money's numbers (the brief: wages may outrun income). **Choice:** prize pools 520,000, 200,000 and
  105,000 Coin, shared by (n + 1 − place)^spread; fixed patrons 4.6 × crew marketability × tier × league (1.7, 1, 1)
  a race, objective patrons a bonus of 7 × the same × the objective's weight. Measured at founding: a median League One
  crew's wages and upkeep ≈ 3,760 a race; three patrons ≈ 1,800, fish ≈ 220, its prize ≈ 13,000 a season. Most crews
  run into debt mid-season and recover at the prize. **Why:** a median crew about balances; the owner tunes the rest.
- **Question:** wages below the floor. **Choice:** owed payments (wages, upkeep, fines) are paid even past the floor;
  every spend is checked by `canSpend`. **Why:** section 10's floor limits choices, not obligations.
- **Question:** reputation and marketability numbers. **Choice:** a crew's ± 0.1 a point against the league's mean
  (to ± 3) a race, + 10 a title, + 6 promotion, − 8 relegation; a manager's ± 0.5 a place better than target (to ± 2);
  the player's also ± 0.15 a point of their own ship against a ship's mean, + 0.5 a sinking (to ± 3), and the player's
  reputation is their manager gull's. Marketability: + 3 a podium, + 1 a sinking, drifting 10% a race toward its anchor
  (stars and youth; the player's reputation). A crew's = 0.4 reputation + 0.6 its two sailors' mean. **Why:** section 10.
- **Question:** patrons' offers. **Choice:** a `patronOffer` event a crew every 42 days (first staggered over the first
  two weeks), two offers standing 14 days, tier 1 to the landing pad's level, 3 to 10 races, half paying for
  objectives (2 or 3 of top 10, sink two, both afloat, the most sea). Signing into a filled slot replaces that patron.
  The objective chosen is by slot in the race plan (`Plan.objectives`), the first if none. **Why:** section 10.
- **Question:** the Admiralty's calendar and count. **Choice:** a `proposal` event 12 days before round indexes 3 and 7
  each league; one measure by seed on stream 'admiralty'; its `vote` event the day before that race. Rivals vote by
  `measure.ts lean` (abstain within 0.2 of even); the player's silence abstains; abstaining rivals join the side with
  more sway with a chance of the margin's share. Sway = reputation × Politics u (the player's reputation), plus Coin
  lobbied × 0.1. More for than against carries; ties keep the rule. Carried changes go to `league.next`; `rulesTurned`
  puts them in force at the season's end. **Why:** section 11.
- **Question:** a rival's measure where a result can't say it. **Choice:** banning a gun kind leans on the crew's
  captains' mean Gunnery (results name no gun kind); sea-held point on homesteader and turtle captains' share; prize
  spread on coin against half the budget; inspection on the crew's fitted risk. **Why:** each from state a rival has.
- **Question:** the rivals' rows. **Choice:** `career/works.ts`: yard (split by rank in the league × room left,
  Development's evenness), design (worst-ranked non-spec type; each slot's best card by worth per Coin, risk by
  personality; next season's late), build (personality's order, up to 0.6 of room), patrons (fill empty slots; replace
  for 1.5 − 0.5 × Finance u more), suppliers (personality's weights), vote (measure). Rows `suppliers` and `vote` join
  every personality's order at 0.6 and 0.5. **Why:** section 6's table; every row acts through the player's checks.
- **Question:** schema. **Choice:** Crew, Patron, Proposal and Design fields changed without a SCHEMA bump, as earlier
  agents did before release; TUNING_VERSION 3. **Why:** no saves outside tests exist yet.

## 2026-11-15, Phase B (#59), sections 12–16

- **Question:** who sails each ship on race day. **Choice:** `career/lineup.ts lineups(s)`, a pure function of the state
  read by the cards and the round's close alike: the player's ship one is theirs; ship two takes the plan's captain if
  fit, else her own captain, else the reserve, else a stand-in (the best fit free captain not yet engaged, the player's
  crew first, then by crew id, paid their ask for the one race); with none she is forfeit (sunk at the start). While the
  player's race is under way the career takes only RecordRace, Forfeit and MarkRead (`racing`), so the lineup cannot
  change under the race. **Why:** "never start a race with a ship that has no one to sail her" holds by construction.
- **Question:** what a Forfeit forfeits. **Choice:** the player's own ship (ship one) counts sunk at the start; ship two
  is simulated and sails on. A second Forfeit of the same race is refused (`forfeited`). **Why:** D27 is about the
  player leaving their race; ship two was never theirs to sail.
- **Question:** the order of the season's end. **Choice:** prizes, then the elders' verdicts (targets missed by more
  than 5 places sack), then promotion and relegation (four up, four down), then the new calendar a YEAR on, rules
  turned. DebugToSeasonEnd runs past every stop but race days (a race's result is the match's to give). **Why:** a
  verdict reads the season as sailed, in the league it was sailed in.
- **Question:** when the next season opens. **Choice:** its `seasonStart` event falls midway between the season's end
  and the first race (`floor((start − off + first race) / 2)`), and stops Advance after the first season. **Why:** it
  splits the long off-season (every review of 120 crews in one call) so Advance stays under 100 ms, and gives the
  player a beat to read the season's mail.
- **Question:** the twelve dilemmas' loose ends. **Choice:** `pressElder` is the elder's dilemma (weighted by Meddling);
  `stormDamage` always hits the factory; `partSwap` exchanges two parts' numbers (perf, reliability, risk, components,
  cost), not their ids, so fitted slots stand; a dilemma unanswered lapses to its last option at the next round's draw;
  rivals answer at once by personality (the last option if theirs cannot be taken). **Why:** the spec leaves each open;
  each choice keeps parts and staff invariants simple.
- **Question:** dilemma frequency. **Choice:** chance 0.6 a crew a round (was 0.3); for the player each candidate's
  weight is divided by 1 + how often it has come to them. **Why:** at 0.3 with the common triggers (patronGuest,
  partSwap) nearly always holding, the rare dilemmas did not come in twenty seasons.
- **Question:** `flightWorn`'s trigger. **Choice:** a flight gull whose fatigue *after the last race* is over 30
  (`dilemmas.worn`, was 75 on today's fatigue). **Why:** a race adds at most ~49 fatigue and the 14 days between races
  recover all of it, so "over 75" could never hold on any day.
- **Question:** `bondFallOut` after five races. **Choice:** a captain–bosun pair still at bond level 1 or lower (not 0).
  **Why:** a bond gains 1–2 a race, so after five races every pair is past level 0; the trigger could never hold.
- **Question:** Leadership's fatigue factor. **Choice:** the flight's fatigue gain is multiplied by
  `leadershipFatigue(bosun's Leadership)` (ship one's bosun, else ship two's). **Why:** a rule of section 2.1 the round's
  close had left out.
- **Question:** biome traits and morale. **Choice:** biome traits are never read by the career (they stay the race's);
  each staff gull's morale after a race is the sum of the standing against the crew's target, their traits' morale,
  their wage against their ask, for a captain whether they sailed (more if they want status), the ship's bond level
  for her captain and bosun, and for the flight the bosuns' Leadership; the dilemmas' answers move it apart. Race
  records are kept for captains only. **Why:** career/ cannot import sim/; the race's traits stay in the race.
- **Question:** money's scale over two seasons (`node tools/season.ts 2`, the default seed). **Choice:** prize pools
  doubled (League One 1,040,000; Two 400,000; Three 210,000); nothing else changed. Observed before the season's prizes:
  crews' coin median −22,434 (League One), −8,265 (Two), −4,724 (Three) in season 1; −7,661, −4,864, −5,293 in season 2;
  the player's crew started seasons 1 and 2 with 1,485 and 2,612. Over twenty seasons the player's start coin ran
  between about −6,700 and +210,000. **Why:** before the doubling a median League One crew lost ~26,000 a season with no
  way back; now a median crew about balances once prizes and patrons are paid, as section 10 asks.
- **Question:** a rival's room to spend. **Choice:** `money.ts roomOf` = commitment of its finance to the season's
  projected end over the debt floor, and a rival never plans past `min(roomOf, commitment of its coin now)`. **Why:**
  without the projection rivals overcommitted and sank past the floor every season.
- **Question:** Advance's cost. **Choice:** a rival's scouting looks at most `rivals.scoutLooks` (240) candidates, an
  even sample from a drawn offset (stream 'scout'); a rival's knowledge is read lazily; the rank among fitted parts is
  one pass. **Why:** Advance between race days ran 180–230 ms; now at most ~91 ms (mean ~4 ms). A call through a
  season's end (prizes, verdicts, promotion, 120 reviews) is outside that gate and runs up to ~103 ms on this machine.
- **Question:** when Advance stops. **Choice:** on race day, a job offer's expiry, the season's opening (after season 0),
  the player's dilemma mail, an answer or a review that approaches the player's gulls, and the player sacked. **Why:**
  a sacked player cannot Advance (they must take a post), so Advance must hand back at once.
- **Question:** job offers. **Choice:** while the player has a crew only crews of their league or better offer, two at
  most standing (`elder.standing`), one an offer a crew; while sacked any league offers. **Why:** before this, ~14,000
  offers in twenty seasons drowned the mail.
- **Question:** replay determinism of stars. **Choice:** `starsOf` sums the stats in sorted key order. **Why:** a save
  sorts keys; summing floats in insertion order gave a different last bit after a reload, and the replay diverged.
- **Question:** the spend invariant. **Choice:** `spendKept` exempts Advance, RecordRace, TakeJob, DeclineJob and the
  debug commands. **Why:** these pay obligations (wages, stand-ins, an elder's hire), not choices the floor limits.
- **Question:** sackings. **Choice:** recorded, not tuned: ~100 managers a season of 120 crews in `tools/season.ts`.
  **Why:** the synthetic results are noise around stars, so targets are missed far more than in sailed races; section
  15 gates nothing about balance.
- **Question:** rare mail in twenty seasons. **Choice:** recorded, not forced. With the default seed every mail kind and
  dilemma comes but `captainUnfit` and `unfitWantsSail` (both need a captain of the player's injured: 4% a sinking, the
  spec's number); with `--seed=2`, `componentLearned`, `shipsArgue`, `bondFallOut`, `greyComponent` do not. Every
  dilemma's trigger and answers are met and tested in `tests/career-dilemmas.test.ts`. **Why:** the bot is not a
  player; bending the spec's chances to fill a table would hide the game's real rarity.
- **Question:** the IndexedDB store. **Choice:** `store/indexed.ts`: object stores `entries` (JSON text keyed by seq),
  `snapshots` (keyed by the seq they hold, newest three kept) and `backup` (one record); every write one transaction.
  The store suite (`tests/store-suite.ts`) runs on memory and faulty in `npm test` and on IndexedDB in headless
  Chromium (`npm run indexed`). A tear cannot happen inside an IndexedDB transaction, so its kill test is "killed
  before a write" at every write. **Why:** section 16.
- **Question:** the screens' selectors. **Choice:** `career/read.ts`: `mailView`, `unread`, `table`, `fixtures`,
  `preview`, `dilemmaView`, pure over the state. **Why:** Phase C draws from them as given.
- **Question:** tuning. **Choice:** TUNING_VERSION 4 (prizes, elder.standing, rivals.scoutLooks, dilemmas.worn and
  chance). **Why:** D36's pin.

## 2026-11-15, fix-ups before Phase C (manager-fix)

- **Question:** sackings were far too frequent (the earlier "recorded, not tuned" decision above is overturned).
  **Cause:** in career/elders.ts and leadership.ts, not only the synthetic results: confidence moved after every race
  by 1.5 a place behind the target from the first race on (when standings are noise), with no band of tolerance and a
  target pushed up by Ambition, so most crews drifted down; −10 a race past the debt floor, where many rival crews
  sit for whole seasons, emptied it by itself; a new manager could be sacked at once (confidence reset to 70, then
  the same slide), so crews sacked twice a season; the verdict sacked any target missed by 5 places whatever the
  elder thought. **Choice:** confidence holds within `slack` (3) places behind the target, falls `perPlace` (0.6) a
  place beyond it to at most −4 (× Patience), rises `met` (1) plus 0.6 a place ahead to at most 4, and every move
  weighs `sailed / settle` (5) so one early race barely counts; it carries into the next season, a quarter of the way
  back to 70 (`recover`), so a second poor season costs the post where the first warns; a manager has `grace` (half a
  season from their contract's `signed`) before any sacking; sacked at 0 only if more than the slack behind; the
  season's verdict also needs confidence under `verdict` (35); debt costs nothing above the floor and −0.5 a race past
  it; an elder renews its manager's contract at its end if confidence is at least `verdict` (`managersRenewed`,
  tenure kept), since no one renewed managers and ~16 a season walked out at contract's end. Targets are now ranked
  by staff stars and part ranks together, as section 7 says (they were by staff stars only). TUNING_VERSION 5.
  **Synthetic results:** strength was sd ~0.17 against luck of sd ~0.87 (results were nearly pure luck, and parts
  showed in less than 1% of it); now 0.65 × the captain's sailing and 0.35 × the parts (handling), each as standard
  scores across the card, plus normal luck of sd 0.8. **Numbers** (`node tools/season.ts 20`, which now counts a
  sacking apart from a manager poached upward, retired, or whose contract ran out): before, 76.8 sackings a season
  (135, 156, 118 … 18; 1,027 mid-season, 734 within half a season of taking the post; the old tool's 2,163 counted
  every change of manager); after, 9.8 a season on the default seed (11 14 20 10 13 16 14 14 12 13 11 9 8 7 4 6 4 5
  3 2), 10.4 with `--seed=2` (4 to 16); none within half a season of the post; 134 in a crew's second or later poor
  season against 62 in its first; 3 mid-season, the rest at the season's end. **Why:** the brief's believable rate
  (5–15 a season of 120 crews), more in a second poor season, almost never early, never a manager meeting targets;
  unit-tested in tests/career-elders.test.ts. Rival crews spending whole seasons past their floor is the money
  balance the owner tunes; it no longer decides sackings.
- **Question:** Advance across a season's end reached 103 ms (up to 133 ms in later runs), over the 100 ms limit for
  the whole world in node. **Cause:** the crossing is ~22 days and ~360 rival reviews, and each review scanned every
  gull there has ever been (3,647 by season 11, a thousand of them retired): `mindOf().known()` filtered the whole
  list for the crew's key, `fill`/`replace` re-sorted their pool by worth inside the comparator and scanned `s.talks`
  per candidate, `managerCandidates` filtered every gull for each open post, `standingOf` re-sorted a league per call,
  and traits' modifier was rebuilt on every ask. **Choice:** caches of pure values only, no rule changed:
  career/knowledge.ts keeps an index of the gulls known to each crew, brought up to date by comparing a new gulls
  list with the last one read (states share the gulls they did not change, so 1–9 differ an event) and read through
  `knownTo`; bidding.ts reads worth once a candidate and the crew's talks as a set; elders.ts keeps the working
  managers and each league's places per (immutable) list in WeakMaps; traits.ts keeps the unconditional modifier per
  traits list; advance.ts's stop rule reads only today's tail of the mail. **Numbers:** the season-11 crossing
  (scratch bench, 10 runs) from 89–107 ms to 62–65 ms; `node tools/season.ts 20`: through a season's end most 67.3
  ms (was 96–133), between race days most 58.2 ms; its sackings line identical to before; the new test checks the
  index against a full scan across states read out of order. tools/season.ts now exits 1 when any Advance, between
  race days or across a season's end, takes over 100 ms.
- **Question:** the rookery's flock was a stand-in bird of its own. **Choice:** campus/life.ts only works out where
  each of its 11 gulls wheels (`FlockGull`: place, heading, up, the crew's two colours, size) and frame.ts hands them
  to the flights' one instanced draw (gulls/gulls.ts `draw(..., free)`), so they are the flight's gull, its node
  material and wingbeat, wingtips and scarves in the crew's colours; campus/ still never imports gulls/ (the
  architecture test). The stand-in's mesh, material and the palette's GULL tones are gone: one draw fewer (rookery 59
  draws, 330k tri).
- **Question:** some buildings' third levels did not grow from their second (the factory lost its saw-tooth, the
  drawing loft swapped its tiled hip roof for a mansard, the sailing school's roof changed colour). **Choice:** each
  third level keeps the second's form and adds to it: the factory's saw-tooth north lights deeper over two storeys, a
  lower third bay, the chimney raised and a round stack beside it; the drawing loft's hipped tile roof a storey up
  with a glazed lantern, its domed tower taller; the sailing school's roof in tile. TALL follows (factory 16 m,
  drawing loft 20 m at level 3). All nine reviewed level by level in tools/rookery.ts's captures.
- **Question:** a first level stood small on a plot laid out for its third. **Choice:** campus/dressing.ts lays a
  working yard with it at level 1 only: a fence with its gate to the front, a gravel path to the door, and the trade's
  things (timber, crates, barrels, a handcart, a jib crane, a coal heap, perches, a boat on trestles, nets drying);
  tested inside the footprint, on the land for a water plot, under the building, 50–1,200 triangles a yard.
- **Question:** the days-left slips overlapped where buildings stand close, and were cut at the screen's edge.
  **Choice:** ui/stack.ts (pure, tested) settles them nearest the viewer first, each lifted just over any it would
  cover, and keeps a slip wholly on the screen when its building is on it.
- **Question:** #61 wanted every biome captured. **Choice:** tools/biomes.ts captures `seedIn(name, 7)` of each
  biome (the planets `budget.ts --biomes` judges) from orbit (the arrival's first frame) and at sea level in the race,
  her flight called and mending on her deck, the look swung to her beam so the gulls, her ship and the land show
  together; the UI hidden. All six read right; the haze in two sea views is the low sun ahead.
