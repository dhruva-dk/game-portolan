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
