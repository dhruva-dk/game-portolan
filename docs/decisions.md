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
- **Question:** the debug sea about her (`?atsea`) once PLAY deals cards. **Choice:** it clears card-less, every ship
  a side of her own. **Why:** its lashed ships are targets to shoot.
